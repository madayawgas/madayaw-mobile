/**
 * SQLite Database Schema Definitions for MadayawGas Mobile
 */

export const SCHEMA_SQL = `
-- 1. Active Shift / Trip Metadata
CREATE TABLE IF NOT EXISTS local_active_trip (
  trip_id TEXT PRIMARY KEY,
  trip_number TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  sales_user_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  status TEXT NOT NULL,
  dispatched_at TEXT NOT NULL
);

-- 2. Vehicle Inventory Counters (Discrete integer units)
CREATE TABLE IF NOT EXISTS local_vehicle_inventory (
  product_id TEXT PRIMARY KEY,
  sku TEXT,
  product_name TEXT NOT NULL,
  quantity_loaded INTEGER NOT NULL DEFAULT 0,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  quantity_remaining INTEGER NOT NULL DEFAULT 0
);

-- 3. Customer Directory & Running Canister Debt Ledger
CREATE TABLE IF NOT EXISTS local_customers (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  customer_type TEXT NOT NULL,
  zone_id TEXT,
  canister_debt INTEGER NOT NULL DEFAULT 0,
  is_locally_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 4. Sales Orders / Transactions
CREATE TABLE IF NOT EXISTS local_sales_orders (
  id TEXT PRIMARY KEY,
  transaction_no TEXT NOT NULL UNIQUE,
  trip_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  receipt_number TEXT NOT NULL UNIQUE,
  total_amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  transacted_at TEXT NOT NULL,
  synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (customer_id) REFERENCES local_customers (id)
);

-- 5. Sales Order Line Items
CREATE TABLE IF NOT EXISTS local_sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT,
  quantity_sold INTEGER NOT NULL,
  empties_returned INTEGER NOT NULL DEFAULT 0,
  empties_defective INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (sales_order_id) REFERENCES local_sales_orders (id) ON DELETE CASCADE
);

-- 6. Canister Swap Running Ledger
CREATE TABLE IF NOT EXISTS local_canister_ledger (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  quantity_loaned INTEGER NOT NULL DEFAULT 0,
  quantity_returned INTEGER NOT NULL DEFAULT 0,
  net_balance_change INTEGER NOT NULL,
  transacted_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES local_customers (id),
  FOREIGN KEY (transaction_id) REFERENCES local_sales_orders (id) ON DELETE CASCADE
);

-- 7. Store-and-Forward Mutation Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  payload TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  last_attempted_at TEXT,
  error_message TEXT
);

-- 8. Monotonic Receipt Sequence Tracking (INV and CD series)
CREATE TABLE IF NOT EXISTS local_receipt_sequences (
  trip_id TEXT NOT NULL,
  series_type TEXT NOT NULL, -- 'INV' or 'CD'
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, series_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_search ON local_customers (business_name, contact_person);
CREATE INDEX IF NOT EXISTS idx_sales_orders_trip ON local_sales_orders (trip_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_order ON local_sales_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status, created_at);
`;
