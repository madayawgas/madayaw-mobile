/**
 * API Request & Response DTOs
 * Aligned with docs/api-contracts/ specifications.
 */

import { Customer, ProductCatalogItem, UserSession } from './domain';

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
// BATCH SYNC DTOs
// ==========================================

export interface SyncBatchItemPayload {
  queueId: string;
  operationType: 'CREATE_ORDER' | 'CREATE_CUSTOMER' | 'ZERO_SALE_DECLARATION';
  payload: any;
}

export interface SyncBatchRequest {
  tripId: string;
  salesUserId: string;
  batches: SyncBatchItemPayload[];
}

export interface SyncBatchResultItem {
  queueId: string;
  success: boolean;
  syncedId?: string;
  error?: string;
}

export interface SyncBatchResponseData {
  processedCount: number;
  results: SyncBatchResultItem[];
  syncedAt: string;
}
