import { ActiveAssignmentResponseData, TripStockItem } from '@/types';

export const MOCK_ACTIVE_TRIP: ActiveAssignmentResponseData = {
  trip: {
    id: 'trip-20261016-001-uuid',
    tripNumber: 'TRIP-20261016-DSD1',
    truckId: 'veh-isuzu-001-uuid',
    truckPlateNumber: 'ABC-1001',
    truckModel: 'Hanabi Kagura / Isuzu Forward',
    driverId: 'driver-danilo-001-uuid',
    driverName: 'Danilo Driver',
    salesUserId: '3c987654-3210-4cba-fed0-987654321cba',
    salesUserName: 'Juan Dela Cruz',
    zoneId: '7b8f9e6a-5432-41a9-83bc-9d0e12345678',
    zoneName: 'Davao City - Central Sector',
    status: 'IN_PROGRESS',
    departureTime: '2026-10-16T06:30:00.000Z',
    notes: 'Morning departure from Bunawan Refilling Plant',
  },
};

export const MOCK_INITIAL_TRIP_STOCK: TripStockItem[] = [
  {
    productId: 'prod-butane-170g-001',
    productName: '170g Butane Canister',
    sku: 'BUTANE_170G',
    condition: 'FILLED',
    quantityUnits: 120, // 5 crates x 24 units = 120 raw units
  },
  {
    productId: 'prod-lpg-11kg-002',
    productName: '11kg LPG Cylinder',
    sku: 'LPG_11KG',
    condition: 'FILLED',
    quantityUnits: 80,
  },
  {
    productId: 'prod-lpg-50kg-003',
    productName: '50kg LPG Cylinder',
    sku: 'LPG_50KG',
    condition: 'FILLED',
    quantityUnits: 15,
  },
];
