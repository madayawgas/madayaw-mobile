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
  await db.execAsync(`
    DELETE FROM local_canister_ledger;
    DELETE FROM local_sales_items;
    DELETE FROM local_sales_orders;
    DELETE FROM local_active_trip;
    DELETE FROM local_vehicle_inventory;
    DELETE FROM local_receipt_sequences;
  `);
}

/**
 * Drops all local SQLite tables and recreates the fresh schema.
 * Clears all pending sync items, active trips, cached inventory, customers, and operational logs.
 */
export async function resetFullDatabase(): Promise<void> {
  const db = await getDatabase();
  try {
    // 1. Temporarily disable foreign keys so tables can be dropped in any order
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.execAsync(`
      DROP TABLE IF EXISTS local_canister_ledger;
      DROP TABLE IF EXISTS local_sales_items;
      DROP TABLE IF EXISTS local_sales_orders;
      DROP TABLE IF EXISTS local_customers;
      DROP TABLE IF EXISTS local_vehicle_inventory;
      DROP TABLE IF EXISTS local_active_trip;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS local_receipt_sequences;
      DROP TABLE IF EXISTS local_driver_shift;
      DROP TABLE IF EXISTS local_vehicle_telemetry;
      DROP TABLE IF EXISTS local_fuel_logs;
      DROP TABLE IF EXISTS local_apprehensions;
      DROP TABLE IF EXISTS local_incidents;
    `);
  } finally {
    // 2. Always restore foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // 3. Recreate all 13 schema tables and indexes
  await db.execAsync(SCHEMA_SQL);
}

