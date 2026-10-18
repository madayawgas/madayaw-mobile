import { getDatabase } from '../connection';
import { SyncQueueItem } from '@/types';

export const syncQueueRepository = {
  async enqueue(item: Omit<SyncQueueItem, 'retry_count' | 'status' | 'created_at'>): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO sync_queue (
        id, operation_type, endpoint, payload, retry_count, status, created_at
      ) VALUES (?, ?, ?, ?, 0, 'PENDING', ?);`,
      [item.id, item.operation_type, item.endpoint, item.payload, now]
    );
  },

  async getPendingItems(limit: number = 50): Promise<SyncQueueItem[]> {
    const db = await getDatabase();
    return db.getAllAsync<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE status = 'PENDING' OR (status = 'FAILED' AND retry_count < 5)
       ORDER BY created_at ASC
       LIMIT ?;`,
      [limit]
    );
  },

  async markBatchSynced(queueIds: string[]): Promise<void> {
    if (queueIds.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    const placeholders = queueIds.map(() => '?').join(',');

    await db.withExclusiveTransactionAsync(async (txn) => {
      // 1. Mark items in sync_queue as SYNCED
      await txn.runAsync(
        `UPDATE sync_queue
         SET status = 'SYNCED', last_attempted_at = ?
         WHERE id IN (${placeholders});`,
        [now, ...queueIds]
      );

      // 2. Also mark corresponding sales orders as SYNCED
      await txn.runAsync(
        `UPDATE local_sales_orders
         SET sync_status = 'SYNCED', synced_at = ?
         WHERE id IN (${placeholders});`,
        [now, ...queueIds]
      );
    });
  },

  async incrementRetry(id: string, errorMessage?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE sync_queue
       SET retry_count = retry_count + 1,
           status = 'FAILED',
           last_attempted_at = ?,
           error_message = ?
       WHERE id = ?;`,
      [now, errorMessage || null, id]
    );
  },

  async getPendingCount(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'PENDING' OR status = 'FAILED';`
    );
    return row?.count || 0;
  },
};
