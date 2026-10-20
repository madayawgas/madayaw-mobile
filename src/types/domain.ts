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
  truck_id?: string;
  truck_model?: string;
  vehicle_plate: string;
  driver_id?: string;
  driver_name: string;
  sales_user_id: string;
  sales_user_name?: string;
  zone_id: string;
  zone_name?: string;
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
  name?: string;
  business_name: string;
  contact_person: string;
  contact_number: string;
  contactNumber?: string;
  delivery_address: string;
  address?: string;
  customer_type: CustomerType;
  customerType?: CustomerType;
  zone_id?: string;
  zoneId?: string;
  canister_debt: number; // Running balance of canisters owed by customer
  canisterDebt?: number;
  total_net_canister_debt?: number;
  is_locally_created: boolean; // Flag if created in cabin while offline
  created_at: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PaymentMethod = 'CASH' | 'GCASH';
export type PaymentStatus = 'PAID_UNVERIFIED' | 'VERIFIED';
export type SyncStatus = 'PENDING' | 'PROCESSING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'QUARANTINED';

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
  error_code?: string | null;
  error_message?: string | null;
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

export type SyncOperationType =
  | 'CREATE_ORDER'
  | 'CREATE_CUSTOMER'
  | 'ZERO_SALE_DECLARATION'
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'LOG_FUEL'
  | 'REPORT_APPREHENSION'
  | 'REPORT_ISSUE'
  | 'EMERGENCY_SOS';

export interface SyncQueueItem {
  id: string; // UUID
  user_id?: string | null;
  operation_type: SyncOperationType;
  endpoint: string;
  payload: string; // JSON serialized string
  retry_count: number;
  status: SyncStatus;
  created_at: string;
  last_attempted_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  last_error?: string | null;
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

// ==========================================
// DRIVER & VEHICLE DOMAIN MODELS
// ==========================================

export type DutyStatus = 'OFF_DUTY' | 'ON_DUTY';

export interface DriverShift {
  id: string; // UUID
  driver_id: string;
  status: DutyStatus;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  synced: boolean;
}

export type VehicleStatus = 'ACTIVE' | 'UNDER_MAINTENANCE' | 'INACTIVE' | 'RETIRED';

export interface VehicleTelemetry {
  truck_id: string;
  plate_number: string;
  model: string;
  current_odometer: number;
  last_pm_odometer: number;
  status: VehicleStatus;
  isPmDue: boolean;
  distanceSinceLastPm: number;
  remainingKmBeforePm: number;
  last_serviced_at?: string | null;
}

export interface FuelLog {
  id: string; // UUID
  truck_id: string;
  driver_id: string;
  liters: number;
  total_cost: number;
  odometer: number;
  receipt_photo_uri?: string | null;
  logged_at: string;
  synced: boolean;
}

export type ApprehendingAgency = 'CTTMO' | 'LTO' | 'PNP' | 'OTHER';

export interface ApprehensionReport {
  id: string; // UUID
  truck_id: string;
  driver_id: string;
  agency: ApprehendingAgency;
  citation_number?: string | null;
  violation_notes: string;
  fine_amount?: number | null;
  ticket_photo_uri: string; // Mandatory proof
  reported_at: string;
  synced: boolean;
}

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface VehicleIssueReport {
  id: string; // UUID
  truck_id: string;
  driver_id: string;
  incident_type: string;
  description: string;
  severity: IssueSeverity;
  photo_uri?: string | null;
  reported_at: string;
  synced: boolean;
}

export type EmergencyType = 'ACCIDENT' | 'MECHANICAL' | 'MEDICAL' | 'SECURITY' | 'OTHER';

export interface EmergencyAlertPayload {
  driverId: string;
  vehicleId: string;
  tripId?: string | null;
  emergencyType: EmergencyType;
  description?: string;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
}

export interface MaintenanceServiceLogItem {
  id: string;
  truckId: string;
  serviceType: string;
  title: string;
  description?: string;
  odometerAtService: number;
  completedAt: string;
  cost?: number;
}

export interface ServiceZone {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  isActive?: boolean;
}

