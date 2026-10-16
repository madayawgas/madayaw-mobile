import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import { SyncBatchRequest, SyncBatchResponseData } from '@/types';

export const syncApi = {
  async postSyncBatch(batch: SyncBatchRequest): Promise<SyncBatchResponseData> {
    if (ENV.USE_MOCK) {
      await delay(500);
      return {
        processedCount: batch.batches.length,
        results: batch.batches.map((b) => ({
          queueId: b.queueId,
          success: true,
          syncedId: b.queueId,
        })),
        syncedAt: new Date().toISOString(),
      };
    }

    const res = await apiClient<SyncBatchResponseData>('/sales/sync-batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
    return res.data;
  },
};
