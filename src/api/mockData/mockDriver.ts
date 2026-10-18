import {
  VehicleTelemetry,
  MaintenanceServiceLogItem,
  FuelLog,
} from '@/types';

export const MOCK_VEHICLE_TELEMETRY: VehicleTelemetry = {
  truck_id: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
  plate_number: 'ABC-1001',
  model: 'Isuzu Elf N-Series',
  current_odometer: 45200,
  last_pm_odometer: 40000,
  status: 'ACTIVE',
  isPmDue: true,
  distanceSinceLastPm: 5200,
  remainingKmBeforePm: 0,
  last_serviced_at: '2026-10-05T08:00:00.000Z',
};

export const MOCK_MAINTENANCE_LOGS: MaintenanceServiceLogItem[] = [
  {
    id: 'wo-log-001',
    truckId: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    serviceType: 'PREVENTIVE',
    title: '5,000-km Periodic Maintenance & Oil Change',
    description: 'Replaced engine oil (15W-40), primary fuel filter, and oil filter element.',
    odometerAtService: 41200,
    completedAt: '2026-10-05T14:30:00.000Z',
    cost: 4850,
  },
  {
    id: 'wo-log-002',
    truckId: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    serviceType: 'CORRECTIVE',
    title: 'Front Brake Pad Relining & Fluid Flush',
    description: 'Replaced worn front brake pads and bled hydraulic brake fluid lines.',
    odometerAtService: 36000,
    completedAt: '2026-10-01T11:00:00.000Z',
    cost: 3200,
  },
  {
    id: 'wo-log-003',
    truckId: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    serviceType: 'PREVENTIVE',
    title: 'Tire Rotation, Balancing & Wheel Alignment',
    description: 'Cross-rotated rear dual tires and performed camber alignment.',
    odometerAtService: 31000,
    completedAt: '2026-10-01T16:00:00.000Z',
    cost: 2400,
  },
];

export const MOCK_PAST_FUEL_LOGS: FuelLog[] = [
  {
    id: 'fuel-log-001',
    truck_id: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    driver_id: 'd8bb9909-ae9a-4d08-a845-4a497e1bf596',
    liters: 45.5,
    total_cost: 2500,
    odometer: 45200,
    receipt_photo_uri: null,
    logged_at: '2026-10-14T07:15:00.000Z',
    synced: true,
  },
  {
    id: 'fuel-log-002',
    truck_id: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    driver_id: 'd8bb9909-ae9a-4d08-a845-4a497e1bf596',
    liters: 50.0,
    total_cost: 2750,
    odometer: 44800,
    receipt_photo_uri: null,
    logged_at: '2026-10-08T06:45:00.000Z',
    synced: true,
  },
  {
    id: 'fuel-log-003',
    truck_id: 'cf568d90-bcf5-4ab8-832c-8a3e0f45663c',
    driver_id: 'd8bb9909-ae9a-4d08-a845-4a497e1bf596',
    liters: 48.2,
    total_cost: 2650,
    odometer: 44350,
    receipt_photo_uri: null,
    logged_at: '2026-10-01T07:00:00.000Z',
    synced: true,
  },
];
