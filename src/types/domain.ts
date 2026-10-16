/**
 * Domain Models for MadayawGas Mobile & SQLite persistence.
 * Aligned with PostgreSQL schema and DSD mobile operational flow.
 */

export type ProductSku = 'BUTANE_170G' | 'LPG_11KG' | 'LPG_50KG';

export type ContainerType = 'CANISTER' | 'CYLINDER';

export interface ProductCatalogItem {
  id: string; // UUID
  sku: ProductSku;
  name: string;
  category: string;
  containerType: ContainerType;
  netWeightKg: number;
  price: number;
  unitsPerCrate?: number; // UI abstraction: 24 units for Butane 170g
  isActive: boolean;
}

export type TripStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ActiveTrip {
  trip_id: string; // UUID
  trip_number: string;
  vehicle_plate: string;
  driver_name: string;
  sales_user_id: string;
  zone_id: string;
  status: TripStatus;
  dispatched_at: string; // ISO string
}

export interface VehicleInventory {
  product_id: string; // UUID
  sku?: ProductSku;
  product_name: string;
  quantity_loaded: number;
  quantity_sold: number;
  quantity_remaining: number;
}

export type CustomerType = 'RETAIL' | 'COMMERCIAL' | 'WHOLESALE' | 'HOUSEHOLD';

export interface Customer {
  id: string; // UUID
  business_name: string;
  contact_person: string;
  contact_number: string;
  delivery_address: string;
  customer_type: CustomerType;
  zone_id?: string;
  canister_debt: number; // Running balance of canisters owed by customer
  is_locally_created: boolean; // Flag if created in cabin while offline
  created_at: string;
}

export type PaymentMethod = 'CASH' | 'GCASH';
export type PaymentStatus = 'PAID_UNVERIFIED' | 'VERIFIED';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface SalesOrder {
  id: string; // UUID
  transaction_no: string; // TX-<prefix>-XXXX
  trip_id: string;
  customer_id: string;
  customer_name?: string;
  receipt_number: string; // INV-<prefix>-XXXX or CD-<prefix>-XXXX
  total_amount: number;
  payment_method: PaymentMethod;
  payment_reference?: string;
  transacted_at: string; // Device wall-clock ISO string
  synced_at?: string | null;
  sync_status: SyncStatus;
}

export interface SalesOrderItem {
  id: string; // UUID
  sales_order_id: string;
  product_id: string;
  product_name?: string;
  quantity_sold: number;
  empties_returned: number;
  empties_defective: number;
  unit_price: number;
  subtotal: number;
}

export interface CanisterLedgerEntry {
  id: string; // UUID
  customer_id: string;
  product_id: string;
  trip_id: string;
  transaction_id: string;
  quantity_loaned: number;
  quantity_returned: number;
  net_balance_change: number; // quantity_loaned - quantity_returned
  transacted_at: string;
}

export type SyncOperationType = 'CREATE_ORDER' | 'CREATE_CUSTOMER' | 'ZERO_SALE_DECLARATION';

export interface SyncQueueItem {
  id: string; // UUID
  operation_type: SyncOperationType;
  endpoint: string;
  payload: string; // JSON serialized string
  retry_count: number;
  status: SyncStatus;
  created_at: string;
  last_attempted_at?: string | null;
  error_message?: string | null;
}

export interface UserSession {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  roles?: { id: string; name: string; isPrimary: boolean }[];
  permissions: string[];
  token: string;
  savedAt: string;
}
