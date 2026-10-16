import { getDatabase } from '../connection';
import { VehicleInventory } from '@/types';

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

  async seedInventory(items: VehicleInventory[]): Promise<void> {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async () => {
      await db.runAsync('DELETE FROM local_vehicle_inventory;');
      for (const item of items) {
        await db.runAsync(
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
