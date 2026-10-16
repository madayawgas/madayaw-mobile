import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Initializes and returns the local SQLite database singleton.
 * Configures PRAGMA journal_mode = WAL and foreign_keys = ON.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('madayawgas.db');

    // Enable WAL mode for high concurrency and resilience against app kills
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // Execute schema tables and indexes
    await db.execAsync(SCHEMA_SQL);

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

/**
 * Resets all shift-specific tables in the database (useful when completing shift or testing)
 */
export async function resetShiftDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM local_active_trip;
      DELETE FROM local_vehicle_inventory;
      DELETE FROM local_sales_items;
      DELETE FROM local_canister_ledger;
      DELETE FROM local_sales_orders;
      DELETE FROM local_receipt_sequences;
    `);
  });
}
