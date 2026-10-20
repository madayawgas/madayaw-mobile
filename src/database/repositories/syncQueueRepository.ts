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
         WHERE (status = 'PENDING' OR (status = 'FAILED' AND retry_count < 3))
           AND status NOT IN ('PROCESSING', 'QUARANTINED', 'SYNCED')
           AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at ASC
         LIMIT ?;`,
        [userId, limit]
      );
    }
    return db.getAllAsync<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE (status = 'PENDING' OR (status = 'FAILED' AND retry_count < 3))
         AND status NOT IN ('PROCESSING', 'QUARANTINED', 'SYNCED')
       ORDER BY created_at ASC
       LIMIT ?;`,
      [limit]
    );
  },

  async markItemsProcessing(queueIds: string[]): Promise<void> {
    if (queueIds.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    const placeholders = queueIds.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE sync_queue
       SET status = 'PROCESSING', last_attempted_at = ?
       WHERE id IN (${placeholders});`,
      [now, ...queueIds]
    );
  },

  async resetProcessingItems(queueIds?: string[]): Promise<void> {
    const db = await getDatabase();
    if (queueIds && queueIds.length > 0) {
      const placeholders = queueIds.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE sync_queue
         SET status = 'PENDING'
         WHERE status = 'PROCESSING' AND id IN (${placeholders});`,
        queueIds
      );
    } else {
      await db.runAsync(
        `UPDATE sync_queue
         SET status = 'PENDING'
         WHERE status = 'PROCESSING';`
      );
    }
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

  async quarantineItem(id: string, errorCode: string, errorMessage?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `UPDATE sync_queue
         SET status = 'QUARANTINED',
             error_code = ?,
             error_message = ?,
             last_error = ?,
             last_attempted_at = ?
         WHERE id = ?;`,
        [errorCode, errorMessage || null, errorMessage || null, now, id]
      );
      await txn.runAsync(
        `UPDATE local_sales_orders
         SET sync_status = 'QUARANTINED',
             error_code = ?,
             error_message = ?
         WHERE id = ?;`,
        [errorCode, errorMessage || null, id]
      );
    });
  },

  async incrementRetry(id: string, errorMessage?: string, errorCode?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const item = await db.getFirstAsync<{ retry_count: number }>(
      'SELECT retry_count FROM sync_queue WHERE id = ?;',
      [id]
    );
    const newRetryCount = (item?.retry_count || 0) + 1;
    const newStatus = newRetryCount >= 3 ? 'QUARANTINED' : 'FAILED';

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `UPDATE sync_queue
         SET retry_count = ?,
             status = ?,
             last_attempted_at = ?,
             error_code = COALESCE(?, error_code),
             error_message = ?,
             last_error = ?
         WHERE id = ?;`,
        [newRetryCount, newStatus, now, errorCode || null, errorMessage || null, errorMessage || null, id]
      );
      if (newStatus === 'QUARANTINED') {
        await txn.runAsync(
          `UPDATE local_sales_orders
           SET sync_status = 'QUARANTINED',
               error_code = COALESCE(?, error_code),
               error_message = ?
           WHERE id = ?;`,
          [errorCode || null, errorMessage || null, id]
        );
      }
    });
  },

  async getPendingCount(userId?: string | null): Promise<number> {
    const db = await getDatabase();
    if (userId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE (status = 'PENDING' OR status = 'PROCESSING' OR (status = 'FAILED' AND retry_count < 3))
           AND (user_id = ? OR user_id IS NULL);`,
        [userId]
      );
      return row?.count || 0;
    }
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue
       WHERE status = 'PENDING' OR status = 'PROCESSING' OR (status = 'FAILED' AND retry_count < 3);`
    );
    return row?.count || 0;
  },

  async getQuarantinedCount(userId?: string | null): Promise<number> {
    const db = await getDatabase();
    if (userId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE status = 'QUARANTINED'
           AND (user_id = ? OR user_id IS NULL);`,
        [userId]
      );
      return row?.count || 0;
    }
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'QUARANTINED';`
    );
    return row?.count || 0;
  },

  async getQuarantinedItems(userId?: string | null): Promise<SyncQueueItem[]> {
    const db = await getDatabase();
    if (userId) {
      return db.getAllAsync<SyncQueueItem>(
        `SELECT * FROM sync_queue
         WHERE status = 'QUARANTINED'
           AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at DESC;`,
        [userId]
      );
    }
    return db.getAllAsync<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE status = 'QUARANTINED'
       ORDER BY created_at DESC;`
    );
  },

  /**
   * Check if a specific operation type is pending in the queue for a given user.
   */
  async hasPendingOperation(userId: string, operationType: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue
       WHERE (status = 'PENDING' OR status = 'PROCESSING' OR (status = 'FAILED' AND retry_count < 3))
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

  /**
   * Updates payload JSON for a queued item (e.g. after uploading offline media proof).
   */
  async updatePayload(id: string, payload: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?;', [payload, id]);
  },
};
