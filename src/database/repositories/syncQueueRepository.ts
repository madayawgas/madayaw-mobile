import { getDatabase } from '../connection';
import { SyncQueueItem } from '@/types';

export const syncQueueRepository = {
  async enqueue(item: Omit<SyncQueueItem, 'retry_count' | 'status' | 'created_at'>): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO sync_queue (
        id, user_id, operation_type, endpoint, payload, retry_count, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?);`,
      [item.id, item.user_id || null, item.operation_type, item.endpoint, item.payload, now]
    );
  },

  async getPendingItems(userId?: string | null, limit: number = 50): Promise<SyncQueueItem[]> {
    const db = await getDatabase();
    if (userId) {
      return db.getAllAsync<SyncQueueItem>(
        `SELECT * FROM sync_queue
         WHERE (status = 'PENDING' OR (status = 'FAILED' AND retry_count < 5))
           AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at ASC
         LIMIT ?;`,
        [userId, limit]
      );
    }
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

  async getPendingCount(userId?: string | null): Promise<number> {
    const db = await getDatabase();
    if (userId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE (status = 'PENDING' OR status = 'FAILED')
           AND (user_id = ? OR user_id IS NULL);`,
        [userId]
      );
      return row?.count || 0;
    }
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'PENDING' OR status = 'FAILED';`
    );
    return row?.count || 0;
  },

  /**
   * Check if a specific operation type is pending in the queue for a given user.
   */
  async hasPendingOperation(userId: string, operationType: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue
       WHERE (status = 'PENDING' OR status = 'FAILED')
         AND (user_id = ? OR user_id IS NULL)
         AND operation_type = ?;`,
      [userId, operationType]
    );
    return (row?.count || 0) > 0;
  },

  /**
   * Remove pending operations of specified types for a given user.
   */
  async removePendingOperations(userId: string, operationTypes: string[]): Promise<void> {
    if (operationTypes.length === 0) return;
    const db = await getDatabase();
    const placeholders = operationTypes.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM sync_queue
       WHERE (user_id = ? OR user_id IS NULL)
         AND operation_type IN (${placeholders});`,
      [userId, ...operationTypes]
    );
  },
};
