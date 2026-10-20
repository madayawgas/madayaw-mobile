/**
 * API Request & Response DTOs
 * Aligned with docs/api-contracts/ specifications.
 */

import { Customer, ProductCatalogItem } from './domain';

export interface ApiResponse<T> {
  status: 'success' | 'fail' | 'error';
  message?: string;
  data: T;
}

// ==========================================
// AUTH DTOs
// ==========================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponseData {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    phone: string;
    birthdate?: string | null;
    role: string;
    roleId?: string;
    roles?: { id: string; name: string; isPrimary: boolean }[];
    roleNames?: string[];
    permissions: string[];
    isActive: boolean;
    isBlocked: boolean;
    mustChangePassword: boolean;
  };
  token?: string; // In Dual-Auth, mobile receives token alongside cookie
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

// ==========================================
// TRIP & INVENTORY HYDRATION DTOs
// ==========================================

export interface ActiveAssignmentResponseData {
  trip: {
    id: string;
    tripNumber: string;
    truckId: string;
    truckPlateNumber: string;
    truckModel?: string;
    driverId: string;
    driverName: string;
    salesUserId: string;
    salesUserName: string;
    zoneId: string;
    zoneName?: string;
    status: 'IN_PROGRESS' | 'PENDING';
    departureTime: string;
    notes?: string | null;
  };
}

export interface TripStockItem {
  productId: string;
  productName: string;
  sku: string;
  condition: 'FILLED' | 'EMPTY_GOOD' | 'DEFECTIVE';
  quantityUnits: number;
  loadedFull?: number;
  currentOnBoardFull?: number;
}

export interface TripStockResponseData {
  tripId: string;
  stock: TripStockItem[];
}

export interface CustomerDirectoryResponseData {
  customers: Customer[];
  count: number;
}

export interface ProductCatalogResponseData {
  products: ProductCatalogItem[];
  count: number;
}

// ==========================================
// ==========================================
// BATCH SYNC DTOs
// ==========================================

export interface SyncBatchCustomerPayload {
  id: string;
  businessName?: string;
  contactPerson?: string;
  contactNumber?: string;
  deliveryAddress?: string;
  customerType?: string;
  zoneId?: string;
}

export interface SyncBatchTransactionItemPayload {
  id?: string;
  productId: string;
  quantitySold: number;
  emptiesReturned?: number;
  emptiesDefective?: number;
  unitPriceAtSale: number;
  subtotalAmount?: number;
}

export interface SyncBatchInvoicePayload {
  id?: string;
  invoiceNumber?: string | null;
  declarationNumber?: string | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string;
  paymentReferenceNumber?: string | null;
  paymentProofKey?: string | null;
}

export interface SyncBatchTransactionPayload {
  id: string;
  transactionNo: string;
  customerId: string;
  transactedAt?: string;
  items: SyncBatchTransactionItemPayload[];
  invoice?: SyncBatchInvoicePayload;
  canisterLedger?: any[];
}

export interface SyncBatchRequest {
  tripId: string;
  salesUserId?: string;
  customers?: SyncBatchCustomerPayload[];
  transactions: SyncBatchTransactionPayload[];
}

export interface FailedTransactionItem {
  id: string;
  transactionNo?: string;
  errorCode: string;
  errorMessage?: string;
  message?: string;
  details?: string;
}

export interface FailedCustomerItem {
  id: string;
  businessName?: string;
  errorCode: string;
  errorMessage?: string;
  details?: string;
}

export interface SyncBatchResponseData {
  tripId?: string;
  syncStatus?: 'success' | 'partial_success' | 'fail';
  summary?: {
    totalSubmitted: number;
    processed: number;
    ignored: number;
    failed: number;
  };
  processedCount: number;
  ignoredCount?: number;
  failedCount?: number;
  totalTransactions?: number;
  syncedTransactionIds?: string[];
  ignoredTransactionIds?: string[];
  transactionIds?: string[];
  syncedCustomerIds?: string[];
  failedTransactions?: FailedTransactionItem[];
  failedCustomers?: FailedCustomerItem[];
  syncedAt?: string;
}
