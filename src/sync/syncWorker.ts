import {
  syncQueueRepository,
  tripRepository,
  driverRepository,
  salesRepository,
  customerRepository,
} from '@/database';
import { syncApi } from '@/api';
import { apiClient } from '@/api/client';
import { mediaService } from '@/services/mediaService';
import { authService } from '@/services/authService';
import { UUID_REGEX } from '@/api/endpoints/driverApi';
import {
  SyncBatchRequest,
  SyncBatchCustomerPayload,
  SyncBatchTransactionPayload,
  FailedTransactionItem,
} from '@/types';

let isSyncing = false;

export interface SyncResult {
  attempted: number;
  synced: number;
  failed: number;
  quarantined?: number;
  offline?: boolean;
  errors?: string[];
}

export const syncWorker = {
  isBusy(): boolean {
    return isSyncing;
  },

  /**
   * Executes a single batch upload cycle for pending sync_queue records.
   * Strictly gated on an active authenticated session, user_id scoping,
   * in-memory mutex, and SQLite row locking (status = 'PROCESSING').
   */
  async runSyncCycle(batchSize: number = 25, activeUserId?: string): Promise<SyncResult> {
    if (isSyncing) {
      console.log('[SyncWorker] In-flight mutex active. Sync cycle already in progress.');
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
    let quarantinedCount = 0;

    try {
      // 2. Fetch pending queue items and offline customers
      const pendingItems = await syncQueueRepository.getPendingItems(currentUserId, batchSize);
      const offlineCustomers = await customerRepository.getLocallyCreatedCustomers();

      if (pendingItems.length === 0 && offlineCustomers.length === 0) {
        return { attempted: 0, synced: 0, failed: 0 };
      }

      console.log(
        `[SyncWorker] Ingesting ${pendingItems.length} queued mutation(s) and ${offlineCustomers.length} offline customer(s) for user ${currentUserId}...`
      );

      // 3. Concurrency Lock: Mark pending items as 'PROCESSING' in SQLite
      const pendingItemIds = pendingItems.map((item) => item.id);
      if (pendingItemIds.length > 0) {
        await syncQueueRepository.markItemsProcessing(pendingItemIds);
      }

      const activeTrip = await tripRepository.getActiveTrip();
      const tripId = activeTrip?.trip_id || 'unassigned-trip';
      const salesUserId = activeTrip?.sales_user_id || currentUserId || 'unassigned-user';

      const successfulQueueIds: string[] = [];

      // 4. Partition items: operational actions (driver) vs sales transactions
      const operationalItems = pendingItems.filter(
        (item) =>
          item.operation_type !== 'CREATE_ORDER' &&
          item.operation_type !== 'ZERO_SALE_DECLARATION' &&
          item.endpoint !== '/sales/sync-batch'
      );
      const salesItems = pendingItems.filter(
        (item) =>
          item.operation_type === 'CREATE_ORDER' ||
          item.operation_type === 'ZERO_SALE_DECLARATION' ||
          item.endpoint === '/sales/sync-batch'
      );

      // =======================================================================
      // 5. Process operational mutations directly via their designated endpoints
      // =======================================================================
      for (const item of operationalItems) {
        let payloadObj: any = null;
        try {
          payloadObj = JSON.parse(item.payload);

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

          if (item.operation_type === 'EMERGENCY_SOS') {
            const active = await tripRepository.getActiveTrip();
            // If local active trip is missing or doesn't match payload, strip tripId to avoid FK violations
            if (payloadObj.tripId && (!active || active.trip_id !== payloadObj.tripId)) {
              console.log('[SyncWorker] Purging unverified tripId from queued EMERGENCY_SOS payload before dispatch.');
              delete payloadObj.tripId;
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

          // Self-healing Emergency SOS Foreign Key Recovery:
          if (
            item.operation_type === 'EMERGENCY_SOS' &&
            payloadObj.tripId &&
            (errMsg.includes('emergency_alerts_trip_id_fkey') ||
              errMsg.includes('foreign key constraint') ||
              errMsg.includes('trip_id'))
          ) {
            console.log(
              `[SyncWorker] EMERGENCY_SOS rejected due to stale trip_id foreign key constraint. Retrying immediately without tripId.`
            );
            delete payloadObj.tripId;
            await tripRepository.clearActiveTrip();
            try {
              await apiClient(item.endpoint, {
                method: 'POST',
                body: JSON.stringify(payloadObj),
              });
              successfulQueueIds.push(item.id);
              continue;
            } catch (retryErr: any) {
              console.warn('[SyncWorker] Retry without tripId failed:', retryErr.message);
            }
          }

          // Idempotent attendance resolution:
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

      // =======================================================================
      // 6. Process sales transaction batches through POST /api/sales/sync-batch
      // =======================================================================
      if (salesItems.length > 0 || offlineCustomers.length > 0) {
        try {
          // Pre-ingestion: Offline customers to register first
          const customerPayloads: SyncBatchCustomerPayload[] = offlineCustomers.map((c) => ({
            id: c.id,
            businessName: c.business_name || c.name || undefined,
            contactPerson: c.contact_person || c.name || 'Customer',
            contactNumber: c.contact_number || '',
            deliveryAddress: c.delivery_address || c.address || '',
            customerType: c.customer_type || 'COMMERCIAL',
            zoneId: c.zone_id || undefined,
          }));

          // Pre-process any GCash transactions requiring media upload:
          const validSalesItems: typeof salesItems = [];

          for (const item of salesItems) {
            const p = JSON.parse(item.payload);
            const method = (p.invoice?.paymentMethod || p.invoice?.payment_method || '').toUpperCase();

            if (method === 'GCASH' && !p.invoice?.paymentProofKey) {
              const photoUri = p.invoice?.paymentProofUri || p.payment_reference;
              if (photoUri && typeof photoUri === 'string' && photoUri.startsWith('file://')) {
                try {
                  const uploadRes = await mediaService.uploadMedia(photoUri, 'sales/payments');
                  p.invoice.paymentProofKey = uploadRes.storageKey;
                  // Persist updated payload so future attempts don't re-upload
                  await syncQueueRepository.updatePayload(item.id, JSON.stringify(p));
                  item.payload = JSON.stringify(p);
                  validSalesItems.push(item);
                } catch (upErr: any) {
                  console.warn('[SyncWorker] Could not upload cached GCash payment proof, deferring transaction:', upErr.message);
                  errors.push(`Media upload failed for GCash payment proof: ${upErr.message}`);
                  await syncQueueRepository.incrementRetry(item.id, upErr.message);
                  continue;
                }
              } else {
                console.warn('[SyncWorker] GCash transaction missing required payment proof URI or key. Deferring.');
                errors.push(`GCash transaction ${item.id} missing payment proof`);
                await syncQueueRepository.incrementRetry(item.id, 'Missing payment proof key');
                continue;
              }
            } else {
              validSalesItems.push(item);
            }
          }

          if (validSalesItems.length === 0 && offlineCustomers.length === 0) {
            console.log('[SyncWorker] No valid sales items or offline customers ready for batch sync.');
            const unhandledIds = salesItems.map((it) => it.id);
            if (unhandledIds.length > 0) {
              await syncQueueRepository.resetProcessingItems(unhandledIds);
            }
          } else {
            // Itemized transactions payload mapping
            const transactionPayloads: SyncBatchTransactionPayload[] = validSalesItems.map((item) => {
              const p = JSON.parse(item.payload);
              const tx = p.transaction || p;
              return {
                id: tx.id || item.id,
                transactionNo: tx.transactionNo || tx.transaction_no || `TX-${item.id.slice(0, 8)}`,
                customerId: tx.customerId || tx.customer_id,
                transactedAt: tx.transactedAt || tx.transacted_at || new Date().toISOString(),
                items: (p.items || []).map((it: any) => ({
                  id: it.id,
                  productId: it.productId || it.product_id,
                  quantitySold: Number(it.quantitySold ?? it.quantity_sold ?? 0),
                  emptiesReturned: Number(it.emptiesReturned ?? it.empties_returned ?? 0),
                  emptiesDefective: Number(it.emptiesDefective ?? it.empties_defective ?? 0),
                  unitPriceAtSale: Number(it.unitPriceAtSale ?? it.unitPrice ?? it.unit_price ?? 0),
                  subtotalAmount: Number(it.subtotalAmount ?? it.subtotal ?? 0),
                })),
                invoice: p.invoice
                  ? {
                      id: p.invoice.id,
                      invoiceNumber: p.invoice.invoiceNumber || p.invoice.invoice_number || null,
                      declarationNumber: p.invoice.declarationNumber || p.invoice.declaration_number || null,
                      totalAmount: Number(p.invoice.totalAmount ?? p.invoice.total_amount ?? 0),
                      paymentMethod: p.invoice.paymentMethod || p.invoice.payment_method || 'CASH',
                      paymentStatus: p.invoice.paymentStatus || p.invoice.payment_status || 'PAID_UNVERIFIED',
                      paymentReferenceNumber:
                        p.invoice.paymentReferenceNumber || p.invoice.payment_reference_number || null,
                      paymentProofKey: p.invoice.paymentProofKey || null,
                    }
                  : undefined,
                canisterLedger: p.canisterLedger || [],
              };
            });

            const batchRequest: SyncBatchRequest = {
              tripId,
              salesUserId,
              customers: customerPayloads.length > 0 ? customerPayloads : undefined,
              transactions: transactionPayloads,
            };

            const rawResponse: any = await syncApi.postSyncBatch(batchRequest);
            const responseData = rawResponse?.data || rawResponse;

            // 1. Process Synced Transactions (including idempotently ignored transactions)
            const syncedTxIds = new Set<string>(
              responseData?.syncedTransactionIds || responseData?.transactionIds || []
            );

            for (const item of validSalesItems) {
              const p = JSON.parse(item.payload);
              const txId = p.id || p.transaction?.id || item.id;
              if (syncedTxIds.has(txId) || syncedTxIds.has(item.id)) {
                successfulQueueIds.push(item.id);
                await salesRepository.markOrderSynced(txId);
              }
            }

            // 2. Process Synced Customers
            const syncedCustIds: string[] = responseData?.syncedCustomerIds || [];
            if (syncedCustIds.length > 0) {
              await customerRepository.markBatchCustomersSynced(syncedCustIds);
            }

            // 3. Process Failed Transactions with Error Taxonomy
            const failedTransactions: FailedTransactionItem[] = responseData?.failedTransactions || [];
            const failedTxIdSet = new Set<string>();

            for (const fail of failedTransactions) {
              failedTxIdSet.add(fail.id);
              const errCode = fail.errorCode || 'UNKNOWN_ERROR';
              const errMsg = fail.errorMessage || fail.message || fail.details || 'Sync failed';

              const matchedItem = salesItems.find((it) => {
                const p = JSON.parse(it.payload);
                return it.id === fail.id || p.id === fail.id || p.transaction?.id === fail.id;
              });
              const queueId = matchedItem ? matchedItem.id : fail.id;

              errors.push(`Order #${fail.transactionNo || fail.id}: [${errCode}] ${errMsg}`);

              if (errCode === 'DB_CONSTRAINT_ERROR') {
                // Transient database error: retry up to 3 times before quarantine
                await syncQueueRepository.incrementRetry(queueId, errMsg, errCode);
              } else {
                // Unrecoverable fatal error: quarantine immediately to stop HoL blocking
                quarantinedCount++;
                await syncQueueRepository.quarantineItem(queueId, errCode, errMsg);
              }
            }

            // 4. Process Failed Customers
            const failedCustomers = responseData?.failedCustomers || [];
            for (const failCust of failedCustomers) {
              const errMsg = failCust.errorMessage || failCust.details || 'Pre-ingestion failed';
              console.warn(`[SyncWorker] Offline customer pre-ingestion failed: [${failCust.errorCode}] ${errMsg}`);
              errors.push(`Customer pre-ingest [${failCust.errorCode}]: ${errMsg}`);
            }

            // 5. Reset any unacknowledged sales items back to PENDING (defensive recovery)
            const unhandledSalesIds = salesItems
              .map((it) => it.id)
              .filter((id) => !syncedTxIds.has(id) && !failedTxIdSet.has(id));
            if (unhandledSalesIds.length > 0) {
              await syncQueueRepository.resetProcessingItems(unhandledSalesIds);
            }
          }
        } catch (salesErr: any) {
          console.error('[SyncWorker] Sales batch sync network error:', salesErr);
          errors.push(salesErr.message || 'Sales batch sync network error');
          // Reset sales items back to PENDING so next sweep or reconnect retries them
          const salesQueueIds = salesItems.map((it) => it.id);
          await syncQueueRepository.resetProcessingItems(salesQueueIds);
        }
      }

      // =======================================================================
      // 7. Mark all successfully ingested items as SYNCED
      // =======================================================================
      if (successfulQueueIds.length > 0) {
        await syncQueueRepository.markBatchSynced(successfulQueueIds);
      }

      return {
        attempted: pendingItems.length,
        synced: successfulQueueIds.length,
        failed: errors.length,
        quarantined: quarantinedCount > 0 ? quarantinedCount : undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      console.error('[SyncWorker] Fatal batch sync error:', error);
      errors.push(error.message || 'Sync error');
      // Reset any stuck processing items back to PENDING
      await syncQueueRepository.resetProcessingItems();
      return { attempted: 0, synced: 0, failed: 1, errors };
    } finally {
      isSyncing = false;
    }
  },
};
