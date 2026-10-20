import { getDatabase } from '../connection';
import { VehicleInventory, TripStockItem } from '@/types';

export const inventoryRepository = {
  async getAllInventory(): Promise<VehicleInventory[]> {
    const db = await getDatabase();
    return db.getAllAsync<VehicleInventory>(
      'SELECT * FROM local_vehicle_inventory ORDER BY product_name ASC;'
    );
  },

  async getInventoryByProductId(productId: string): Promise<VehicleInventory | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<VehicleInventory>(
      'SELECT * FROM local_vehicle_inventory WHERE product_id = ?;',
      [productId]
    );
    return row || null;
  },

  async clearInventory(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM local_vehicle_inventory;');
  },

  async syncTripInventory(tripId: string, stockItems: TripStockItem[]): Promise<void> {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      // 1. Calculate local sales recorded for this trip so offline sales remain accounted for
      const soldRows = await txn.getAllAsync<{ product_id: string; total_sold: number }>(
        `SELECT si.product_id, COALESCE(SUM(si.quantity_sold), 0) AS total_sold
         FROM local_sales_items si
         JOIN local_sales_orders so ON si.sales_order_id = so.id
         WHERE so.trip_id = ?
         GROUP BY si.product_id;`,
        [tripId]
      );

      const soldMap = new Map<string, number>();
      for (const row of soldRows) {
        soldMap.set(row.product_id, row.total_sold);
      }

      const activeProductIds: string[] = [];

      // 2. Upsert each dispatched stock item
      for (const item of stockItems) {
        if (!item.productId) continue;
        activeProductIds.push(item.productId);

        const loadedUnits = Number(item.loadedFull ?? item.quantityUnits ?? 0);
        const soldUnits = soldMap.get(item.productId) || 0;
        const remainingUnits = Math.max(0, loadedUnits - soldUnits);

        await txn.runAsync(
          `INSERT INTO local_vehicle_inventory (
            product_id, sku, product_name, quantity_loaded, quantity_sold, quantity_remaining
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            sku = excluded.sku,
            product_name = excluded.product_name,
            quantity_loaded = excluded.quantity_loaded,
            quantity_sold = excluded.quantity_sold,
            quantity_remaining = excluded.quantity_remaining;`,
          [
            item.productId,
            item.sku || null,
            item.productName,
            loadedUnits,
            soldUnits,
            remainingUnits,
          ]
        );
      }

      // 3. Remove products no longer in the active trip manifest
      if (activeProductIds.length > 0) {
        const placeholders = activeProductIds.map(() => '?').join(',');
        await txn.runAsync(
          `DELETE FROM local_vehicle_inventory WHERE product_id NOT IN (${placeholders});`,
          activeProductIds
        );
      } else {
        await txn.runAsync('DELETE FROM local_vehicle_inventory;');
      }
    });
  },

  async seedInventory(items: VehicleInventory[]): Promise<void> {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM local_vehicle_inventory;');
      for (const item of items) {
        await txn.runAsync(
          `INSERT INTO local_vehicle_inventory (
            product_id, sku, product_name, quantity_loaded, quantity_sold, quantity_remaining
          ) VALUES (?, ?, ?, ?, ?, ?);`,
          [
            item.product_id,
            item.sku || null,
            item.product_name,
            item.quantity_loaded,
            item.quantity_sold,
            item.quantity_remaining,
          ]
        );
      }
    });
  },

  async decrementStock(productId: string, soldQty: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_vehicle_inventory
       SET quantity_sold = quantity_sold + ?,
           quantity_remaining = quantity_remaining - ?
       WHERE product_id = ?;`,
      [soldQty, soldQty, productId]
    );
  },
};
