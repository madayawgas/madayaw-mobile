import { getDatabase } from '../connection';
import {
  SalesOrder,
  SalesOrderItem,
  CanisterLedgerEntry,
  SyncQueueItem,
} from '@/types';

export interface CreateSaleParams {
  order: SalesOrder;
  items: SalesOrderItem[];
  canisterEntries: CanisterLedgerEntry[];
  inventoryDeductions: { productId: string; quantitySold: number }[];
  customerDebtChange: number;
  syncQueueItem: Omit<SyncQueueItem, 'retry_count' | 'status' | 'created_at'>;
}

export const salesRepository = {
  /**
   * Generates monotonic sequential control identifier:
   * INV-<tripPrefix>-XXXX for sales transactions
   * CD-<tripPrefix>-XXXX for zero-sale canister declarations
   */
  async getNextControlNumber(tripId: string, tripPrefix: string, isZeroSale: boolean): Promise<string> {
    const db = await getDatabase();
    const seriesType = isZeroSale ? 'CD' : 'INV';

    // Retrieve or initialize last sequence
    let row = await db.getFirstAsync<{ last_sequence: number }>(
      'SELECT last_sequence FROM local_receipt_sequences WHERE trip_id = ? AND series_type = ?;',
      [tripId, seriesType]
    );

    const nextSeq = (row?.last_sequence || 0) + 1;

    await db.runAsync(
      `INSERT INTO local_receipt_sequences (trip_id, series_type, last_sequence)
       VALUES (?, ?, ?)
       ON CONFLICT(trip_id, series_type) DO UPDATE SET last_sequence = excluded.last_sequence;`,
      [tripId, seriesType, nextSeq]
    );

    const paddedSeq = String(nextSeq).padStart(4, '0');
    const cleanPrefix = tripPrefix.replace(/^TRIP-/, '');
    return `${seriesType}-${cleanPrefix}-${paddedSeq}`;
  },

  /**
   * Executes atomic sales transaction:
   * 1. Inserts order
   * 2. Inserts line items
   * 3. Inserts canister ledger swaps
   * 4. Decrements remaining truck inventory
   * 5. Updates customer debt balance
   * 6. Enqueues payload to sync_queue
   */
  async createAtomicSale(params: CreateSaleParams): Promise<void> {
    const db = await getDatabase();
    const { order, items, canisterEntries, inventoryDeductions, customerDebtChange, syncQueueItem } = params;

    await db.withExclusiveTransactionAsync(async (txn) => {
      // 1. Insert Sales Order
      await txn.runAsync(
        `INSERT INTO local_sales_orders (
          id, transaction_no, trip_id, customer_id, customer_name, receipt_number,
          total_amount, payment_method, payment_reference, transacted_at, synced_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          order.id,
          order.transaction_no,
          order.trip_id,
          order.customer_id,
          order.customer_name || null,
          order.receipt_number,
          order.total_amount,
          order.payment_method,
          order.payment_reference || null,
          order.transacted_at,
          order.synced_at || null,
          order.sync_status || 'PENDING',
        ]
      );

      // 2. Insert Line Items
      for (const item of items) {
        await txn.runAsync(
          `INSERT INTO local_sales_items (
            id, sales_order_id, product_id, product_name, quantity_sold,
            empties_returned, empties_defective, unit_price, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            item.id,
            item.sales_order_id,
            item.product_id,
            item.product_name || null,
            item.quantity_sold,
            item.empties_returned,
            item.empties_defective,
            item.unit_price,
            item.subtotal,
          ]
        );
      }

      // 3. Insert Canister Ledger Entries
      for (const entry of canisterEntries) {
        await txn.runAsync(
          `INSERT INTO local_canister_ledger (
            id, customer_id, product_id, trip_id, transaction_id,
            quantity_loaned, quantity_returned, net_balance_change, transacted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            entry.id,
            entry.customer_id,
            entry.product_id,
            entry.trip_id,
            entry.transaction_id,
            entry.quantity_loaned,
            entry.quantity_returned,
            entry.net_balance_change,
            entry.transacted_at,
          ]
        );
      }

      // 4. Decrement Remaining Truck Inventory
      for (const ded of inventoryDeductions) {
        await txn.runAsync(
          `UPDATE local_vehicle_inventory
           SET quantity_sold = quantity_sold + ?,
               quantity_remaining = quantity_remaining - ?
           WHERE product_id = ?;`,
          [ded.quantitySold, ded.quantitySold, ded.productId]
        );
      }

      // 5. Update Customer Canister Debt Balance
      if (customerDebtChange !== 0) {
        await txn.runAsync(
          `UPDATE local_customers
           SET canister_debt = canister_debt + ?
           WHERE id = ?;`,
          [customerDebtChange, order.customer_id]
        );
      }

      // 6. Enqueue into sync_queue
      await txn.runAsync(
        `INSERT INTO sync_queue (
          id, user_id, operation_type, endpoint, payload, retry_count, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?);`,
        [
          syncQueueItem.id,
          syncQueueItem.user_id || null,
          syncQueueItem.operation_type,
          syncQueueItem.endpoint,
          syncQueueItem.payload,
          order.transacted_at,
        ]
      );
    });
  },

  async getRecentOrders(limit: number = 20): Promise<SalesOrder[]> {
    const db = await getDatabase();
    return db.getAllAsync<SalesOrder>(
      `SELECT * FROM local_sales_orders
       ORDER BY transacted_at DESC
       LIMIT ?;`,
      [limit]
    );
  },

  async getOrderWithItems(orderId: string): Promise<{ order: SalesOrder | null; items: SalesOrderItem[] }> {
    const db = await getDatabase();
    const order = await db.getFirstAsync<SalesOrder>(
      'SELECT * FROM local_sales_orders WHERE id = ?;',
      [orderId]
    );
    if (!order) {
      return { order: null, items: [] };
    }
    const items = await db.getAllAsync<SalesOrderItem>(
      'SELECT * FROM local_sales_items WHERE sales_order_id = ?;',
      [orderId]
    );
    return { order, items };
  },

  async getTotalSalesAmount(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(total_amount), 0) AS total FROM local_sales_orders;'
    );
    return row?.total || 0;
  },

  async markOrderSynced(orderId: string, syncedAt?: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_sales_orders
       SET sync_status = 'SYNCED', synced_at = ?
       WHERE id = ?;`,
      [syncedAt || new Date().toISOString(), orderId]
    );
  },
};
