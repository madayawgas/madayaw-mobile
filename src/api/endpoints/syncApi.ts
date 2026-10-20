import { apiClient } from '../client';
import { SyncBatchRequest, SyncBatchResponseData } from '@/types';

export const syncApi = {
  async postSyncBatch(batch: SyncBatchRequest): Promise<SyncBatchResponseData> {
    const res = await apiClient<SyncBatchResponseData>('/sales/sync-batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
    return res.data;
  },
};
