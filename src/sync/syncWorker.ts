import { syncQueueRepository, tripRepository, driverRepository, salesRepository } from '@/database';
import { syncApi } from '@/api';
import { apiClient } from '@/api/client';
import { mediaService } from '@/services/mediaService';
import { authService } from '@/services/authService';
import { UUID_REGEX } from '@/api/endpoints/driverApi';
import { SyncBatchRequest, SyncBatchItemPayload } from '@/types';

let isSyncing = false;

export interface SyncResult {
  attempted: number;
  synced: number;
  failed: number;
  offline?: boolean;
  errors?: string[];
}

export const syncWorker = {
  isBusy(): boolean {
    return isSyncing;
  },

  /**
   * Executes a single batch upload cycle for pending sync_queue records.
   * Strictly gated on an active authenticated session and user_id scoping.
   */
  async runSyncCycle(batchSize: number = 25, activeUserId?: string): Promise<SyncResult> {
    if (isSyncing) {
      console.log('[SyncWorker] Sync already in progress. Skipping cycle.');
      return { attempted: 0, synced: 0, failed: 0 };
    }

    // 1. Session verification invariant: Do NOT sync without an authenticated session!
    const session = await authService.getSession();
    if (!session || !session.token) {
      console.log('[SyncWorker] No active authenticated session found. Sync cycle skipped.');
      return { attempted: 0, synced: 0, failed: 0 };
    }

    const currentUserId = activeUserId || session.id;

    isSyncing = true;
    const errors: string[] = [];

    try {
      // 2. Fetch pending items strictly scoped to the active user
      const pendingItems = await syncQueueRepository.getPendingItems(currentUserId, batchSize);
      if (pendingItems.length === 0) {
        return { attempted: 0, synced: 0, failed: 0 };
      }

      console.log(`[SyncWorker] Ingesting ${pendingItems.length} queued mutation(s) for user ${currentUserId}...`);

      const activeTrip = await tripRepository.getActiveTrip();
      const tripId = activeTrip?.trip_id || 'unassigned-trip';
      const salesUserId = activeTrip?.sales_user_id || currentUserId || 'unassigned-user';

      const successfulQueueIds: string[] = [];

      // Separate operational actions (clock-in, fuel, citations, SOS) from sales order batches
      const operationalItems = pendingItems.filter(
        (item) => item.operation_type !== 'CREATE_ORDER' && item.endpoint !== '/sales/sync-batch'
      );
      const salesItems = pendingItems.filter(
        (item) => item.operation_type === 'CREATE_ORDER' || item.endpoint === '/sales/sync-batch'
      );

      // 1. Process operational mutations directly via their designated REST endpoints
      for (const item of operationalItems) {
        try {
          let payloadObj = JSON.parse(item.payload);

          // Handle offline media uploads before posting operational payload
          if (item.operation_type === 'LOG_FUEL') {
            const photoUri = payloadObj.receiptPhotoUri || payloadObj.receiptMediaKey;
            if (photoUri && typeof photoUri === 'string' && photoUri.startsWith('file://')) {
              try {
                const uploadRes = await mediaService.uploadMedia(photoUri, 'maintenance/receipts');
                payloadObj.receiptMediaKey = uploadRes.storageKey;
                payloadObj.receiptPhotoUri = uploadRes.url;
              } catch (upErr: any) {
                console.warn('[SyncWorker] Could not upload cached fuel receipt, keeping queued for next cycle:', upErr.message);
                errors.push(`Media upload failed for fuel receipt: ${upErr.message}`);
                await syncQueueRepository.incrementRetry(item.id, upErr.message);
                continue;
              }
            }
          } else if (item.operation_type === 'REPORT_APPREHENSION') {
            const photoUri = payloadObj.ticketPhotoUri || payloadObj.ticketMediaKey;
            if (photoUri && typeof photoUri === 'string' && photoUri.startsWith('file://')) {
              try {
                const uploadRes = await mediaService.uploadMedia(photoUri, 'fleet/apprehensions');
                payloadObj.ticketMediaKey = uploadRes.storageKey;
                payloadObj.ticketPhotoUri = uploadRes.url;
              } catch (upErr: any) {
                console.warn('[SyncWorker] Could not upload cached ticket proof, keeping queued for next cycle:', upErr.message);
                errors.push(`Media upload failed for citation ticket: ${upErr.message}`);
                await syncQueueRepository.incrementRetry(item.id, upErr.message);
                continue;
              }
            }
          } else if (item.operation_type === 'REPORT_ISSUE') {
            const photoUri = payloadObj.photoUri || payloadObj.photoMediaKey;
            if (photoUri && typeof photoUri === 'string' && photoUri.startsWith('file://')) {
              try {
                const uploadRes = await mediaService.uploadMedia(photoUri, 'maintenance/incidents');
                payloadObj.photoMediaKey = uploadRes.storageKey;
                payloadObj.photoUri = uploadRes.url;
              } catch (upErr: any) {
                console.warn('[SyncWorker] Could not upload cached incident photo, keeping queued for next cycle:', upErr.message);
                errors.push(`Media upload failed for incident photo: ${upErr.message}`);
                await syncQueueRepository.incrementRetry(item.id, upErr.message);
                continue;
              }
            }
          }

          if (item.operation_type === 'CLOCK_OUT') {
            if (payloadObj.attendanceId && !UUID_REGEX.test(payloadObj.attendanceId)) {
              delete payloadObj.attendanceId;
            }
            if (payloadObj.shiftId && !UUID_REGEX.test(payloadObj.shiftId)) {
              delete payloadObj.shiftId;
            }
          }

          await apiClient(item.endpoint, {
            method: 'POST',
            body: JSON.stringify(payloadObj),
          });

          // Mark corresponding local SQLite entity as synced
          if (item.operation_type === 'LOG_FUEL') {
            await driverRepository.markFuelLogSynced(item.id);
          } else if (item.operation_type === 'REPORT_APPREHENSION') {
            await driverRepository.markApprehensionSynced(item.id);
          } else if (item.operation_type === 'REPORT_ISSUE') {
            await driverRepository.markVehicleIssueSynced(item.id);
          } else if (item.operation_type === 'CLOCK_IN' || item.operation_type === 'CLOCK_OUT') {
            await driverRepository.markShiftSynced(item.id);
            if (item.user_id) {
              await driverRepository.markShiftSynced(item.user_id);
              if (item.operation_type === 'CLOCK_OUT') {
                await driverRepository.closeAllDriverShifts(item.user_id);
              }
            }
          }

          successfulQueueIds.push(item.id);
        } catch (err: any) {
          const errMsg = err?.message || '';
          const errCode = err?.data?.code || '';

          // Idempotent attendance resolution:
          // 1. CLOCK_IN: If user already has an active open duty cycle on server, state is satisfied
          if (
            item.operation_type === 'CLOCK_IN' &&
            (errCode === 'OPEN_DUTY_CYCLE_EXISTS' ||
              errMsg.includes('already has an active open duty cycle'))
          ) {
            console.log(`[SyncWorker] CLOCK_IN already active on server. Resolving queue item ${item.id}.`);
            await driverRepository.markShiftSynced(item.id);
            if (item.user_id) {
              await driverRepository.markShiftSynced(item.user_id);
            }
            successfulQueueIds.push(item.id);
            continue;
          }

          // 2. CLOCK_OUT: If user is already closed on server, state is satisfied
          if (
            item.operation_type === 'CLOCK_OUT' &&
            (errCode === 'NO_ACTIVE_DUTY_CYCLE' ||
              errMsg.includes('No active open duty cycle'))
          ) {
            console.log(`[SyncWorker] CLOCK_OUT already closed on server. Resolving queue item ${item.id}.`);
            await driverRepository.markShiftSynced(item.id);
            if (item.user_id) {
              await driverRepository.markShiftSynced(item.user_id);
              await driverRepository.closeAllDriverShifts(item.user_id);
            }
            successfulQueueIds.push(item.id);
            continue;
          }

          console.warn(`[SyncWorker] Operational mutation failed (${item.operation_type}):`, err.message);
          errors.push(err.message || `Sync failed for ${item.operation_type}`);
          await syncQueueRepository.incrementRetry(item.id, err.message);
        }
      }

      // 2. Process sales transaction batches through the batch sync endpoint
      if (salesItems.length > 0) {
        try {
          const batchPayloads: SyncBatchItemPayload[] = salesItems.map((item) => ({
            queueId: item.id,
            operationType: item.operation_type,
            payload: JSON.parse(item.payload),
          }));

          const request: SyncBatchRequest = {
            tripId,
            salesUserId,
            batches: batchPayloads,
          };

          const response = await syncApi.postSyncBatch(request);

          if (response?.results && Array.isArray(response.results)) {
            for (const res of response.results) {
              if (res.success) {
                successfulQueueIds.push(res.queueId);
                await salesRepository.markOrderSynced(res.queueId);
              } else {
                errors.push(res.error || `Sync failed for item ${res.queueId}`);
                await syncQueueRepository.incrementRetry(res.queueId, res.error);
              }
            }
          } else if (response && (response.processedCount !== undefined || Array.isArray(response.transactionIds))) {
            for (const item of salesItems) {
              successfulQueueIds.push(item.id);
              await salesRepository.markOrderSynced(item.id);
            }
          }
        } catch (salesErr: any) {
          console.error('[SyncWorker] Sales batch sync network error:', salesErr);
          errors.push(salesErr.message || 'Sales batch sync network error');
        }
      }

      if (successfulQueueIds.length > 0) {
        await syncQueueRepository.markBatchSynced(successfulQueueIds);
      }

      return {
        attempted: pendingItems.length,
        synced: successfulQueueIds.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      console.error('[SyncWorker] Batch sync error:', error);
      errors.push(error.message || 'Sync error');
      return { attempted: 0, synced: 0, failed: 1, errors };
    } finally {
      isSyncing = false;
    }
  },
};
