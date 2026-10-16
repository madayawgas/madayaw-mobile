import { syncQueueRepository, tripRepository } from '@/database';
import { syncApi } from '@/api';
import { SyncBatchRequest, SyncBatchItemPayload } from '@/types';

let isSyncing = false;

export interface SyncResult {
  attempted: number;
  synced: number;
  failed: number;
  errors?: string[];
}

export const syncWorker = {
  isBusy(): boolean {
    return isSyncing;
  },

  /**
   * Executes a single batch upload cycle for pending sync_queue records.
   */
  async runSyncCycle(batchSize: number = 25): Promise<SyncResult> {
    if (isSyncing) {
      console.log('[SyncWorker] Sync already in progress. Skipping cycle.');
      return { attempted: 0, synced: 0, failed: 0 };
    }

    isSyncing = true;
    const errors: string[] = [];

    try {
      const pendingItems = await syncQueueRepository.getPendingItems(batchSize);
      if (pendingItems.length === 0) {
        return { attempted: 0, synced: 0, failed: 0 };
      }

      console.log(`[SyncWorker] Ingesting ${pendingItems.length} queued mutation(s)...`);

      const activeTrip = await tripRepository.getActiveTrip();
      const tripId = activeTrip?.trip_id || 'unassigned-trip';
      const salesUserId = activeTrip?.sales_user_id || 'unassigned-user';

      const batchPayloads: SyncBatchItemPayload[] = pendingItems.map((item) => ({
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

      const successfulQueueIds: string[] = [];

      for (const res of response.results) {
        if (res.success) {
          successfulQueueIds.push(res.queueId);
        } else {
          errors.push(res.error || `Sync failed for item ${res.queueId}`);
          await syncQueueRepository.incrementRetry(res.queueId, res.error);
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
      console.error('[SyncWorker] Batch sync network error:', error);
      errors.push(error.message || 'Sync network error');
      return { attempted: 0, synced: 0, failed: 1, errors };
    } finally {
      isSyncing = false;
    }
  },
};
