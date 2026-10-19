import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import {
  EmergencyAlertPayload,
  VehicleTelemetry,
  MaintenanceServiceLogItem,
  FuelLog,
} from '@/types';
import {
  MOCK_VEHICLE_TELEMETRY,
  MOCK_MAINTENANCE_LOGS,
  MOCK_PAST_FUEL_LOGS,
} from '../mockData';

export interface ClockInResponseData {
  shiftId: string;
  driverId: string;
  status: 'ON_DUTY';
  clockInTime: string;
}

export interface ClockOutResponseData {
  shiftId: string;
  driverId: string;
  status: 'OFF_DUTY';
  clockOutTime: string;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const driverApi = {
  // ==========================================
  // 1. Shift Attendance Endpoints
  // ==========================================
  async clockIn(driverId: string, truckId?: string): Promise<ClockInResponseData> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        shiftId: `shift-${Date.now()}`,
        driverId,
        status: 'ON_DUTY',
        clockInTime: new Date().toISOString(),
      };
    }

    const now = new Date().toISOString();
    const res = await apiClient<any>('/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify({
        userId: driverId,
        driverId,
        truckId,
        clockInTime: now,
        timestamp: now,
      }),
    });
    const d = res.data;
    return {
      shiftId: d?.id || d?.shiftId || `shift-${Date.now()}`,
      driverId: d?.userId || d?.driverId || driverId,
      status: 'ON_DUTY',
      clockInTime: d?.clockInTime || d?.clock_in_time || now,
    };
  },

  async clockOut(driverId: string, shiftId?: string): Promise<ClockOutResponseData> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        shiftId: shiftId || `shift-${Date.now()}`,
        driverId,
        status: 'OFF_DUTY',
        clockOutTime: new Date().toISOString(),
      };
    }

    const now = new Date().toISOString();
    const isShiftIdUuid = Boolean(shiftId && UUID_REGEX.test(shiftId));
    const payload: Record<string, any> = {
      userId: driverId,
      driverId,
      clockOutTime: now,
      timestamp: now,
    };
    if (isShiftIdUuid) {
      payload.attendanceId = shiftId;
      payload.shiftId = shiftId;
    }

    const res = await apiClient<any>('/attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const d = res.data;
    return {
      shiftId: d?.id || d?.shiftId || shiftId || `shift-${Date.now()}`,
      driverId: d?.userId || d?.driverId || driverId,
      status: 'OFF_DUTY',
      clockOutTime: d?.clockOutTime || d?.clock_out_time || now,
    };
  },

  // ==========================================
  // 2. Emergency SOS Alert
  // ==========================================
  async triggerEmergencyAlert(payload: EmergencyAlertPayload): Promise<any> {
    if (ENV.USE_MOCK) {
      await delay(200);
      return {
        id: `sos-${Date.now()}`,
        status: 'ACTIVE',
        receivedAt: new Date().toISOString(),
        message: 'Emergency alert dispatched to logistics supervisors and dispatchers.',
      };
    }

    const body: Record<string, any> = {
      driverId: payload.driverId,
      emergencyType: payload.emergencyType || (payload as any).emergency_type || 'OTHER',
      description: payload.description || 'Emergency SOS signal dispatched from mobile cabin.',
      latitude: payload.location?.latitude ?? (payload as any).latitude ?? null,
      longitude: payload.location?.longitude ?? (payload as any).longitude ?? null,
    };

    if (payload.vehicleId && UUID_REGEX.test(payload.vehicleId)) {
      body.vehicleId = payload.vehicleId;
    }
    if (payload.tripId && UUID_REGEX.test(payload.tripId)) {
      body.tripId = payload.tripId;
    }

    const res = await apiClient<any>('/operations/alerts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  // ==========================================
  // 3. Operational Forms (Fuel, Apprehensions, Incidents)
  // ==========================================
  async postFuelLog(payload: any): Promise<any> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        id: `fuel-${Date.now()}`,
        ...payload,
        status: 'SYNCED',
      };
    }

    const res = await apiClient<any>('/operations/fuel', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async postApprehension(payload: any): Promise<any> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        id: `citation-${Date.now()}`,
        ...payload,
        status: 'SYNCED',
      };
    }

    const res = await apiClient<any>('/operations/apprehensions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async postVehicleIncident(payload: any): Promise<any> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        id: `incident-${Date.now()}`,
        ...payload,
        status: 'SYNCED',
      };
    }

    const res = await apiClient<any>('/fleet/maintenance/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  // ==========================================
  // 4. Vehicle Telemetry & History
  // ==========================================
  async fetchMyVehicle(): Promise<VehicleTelemetry> {
    if (ENV.USE_MOCK) {
      await delay(100);
      return MOCK_VEHICLE_TELEMETRY;
    }

    const res = await apiClient<any>('/fleet/my-vehicle', {
      method: 'GET',
    });
    const v = res.data?.vehicle || res.data;
    if (!v) {
      throw new Error('No assigned vehicle found');
    }

    const currentOdo = Number(v.currentOdometer ?? v.current_odometer ?? 0);
    const lastPmOdo = Number(v.lastPmOdometer ?? v.last_pm_odometer ?? 0);
    const distSincePm = Math.max(0, currentOdo - lastPmOdo);
    const remainingPm = Math.max(0, 5000 - distSincePm);

    return {
      truck_id: v.id || v.truck_id,
      plate_number: v.plateNumber || v.plate_number || 'N/A',
      model: v.model || 'Unknown Model',
      current_odometer: currentOdo,
      last_pm_odometer: lastPmOdo,
      status: v.status || 'ACTIVE',
      isPmDue: Boolean(v.isPmDue ?? (distSincePm >= 5000)),
      distanceSinceLastPm: Number(v.distanceSinceLastPm ?? distSincePm),
      remainingKmBeforePm: Number(v.remainingKmBeforePm ?? remainingPm),
      last_serviced_at: v.lastServicedAt || v.last_serviced_at || null,
    };
  },

  async fetchVehicleTelemetry(truckId: string): Promise<VehicleTelemetry> {
    if (ENV.USE_MOCK) {
      await delay(100);
      return {
        ...MOCK_VEHICLE_TELEMETRY,
        truck_id: truckId || MOCK_VEHICLE_TELEMETRY.truck_id,
      };
    }

    const res = await apiClient<any>(`/fleet/vehicles/${truckId}`, {
      method: 'GET',
    });
    const v = res.data?.vehicle || res.data;
    const currentOdo = Number(v.currentOdometer ?? v.current_odometer ?? 0);
    const lastPmOdo = Number(v.lastPmOdometer ?? v.last_pm_odometer ?? 0);
    const distSincePm = Math.max(0, currentOdo - lastPmOdo);
    const remainingPm = Math.max(0, 5000 - distSincePm);

    return {
      truck_id: v.id || v.truck_id || truckId,
      plate_number: v.plateNumber || v.plate_number || 'N/A',
      model: v.model || 'Unknown Model',
      current_odometer: currentOdo,
      last_pm_odometer: lastPmOdo,
      status: v.status || 'ACTIVE',
      isPmDue: Boolean(v.isPmDue ?? (distSincePm >= 5000)),
      distanceSinceLastPm: Number(v.distanceSinceLastPm ?? distSincePm),
      remainingKmBeforePm: Number(v.remainingKmBeforePm ?? remainingPm),
      last_serviced_at: v.lastServicedAt || v.last_serviced_at || null,
    };
  },

  async fetchMaintenanceLogs(truckId: string): Promise<MaintenanceServiceLogItem[]> {
    if (ENV.USE_MOCK) {
      await delay(150);
      return MOCK_MAINTENANCE_LOGS;
    }

    const res = await apiClient<any>(`/fleet/maintenance/logs?truckId=${truckId}`, {
      method: 'GET',
    });
    const rawList = res.data?.logs || res.data || [];
    if (!Array.isArray(rawList)) return [];
    return rawList.map((item: any) => ({
      id: String(item.id),
      truckId: item.vehicleId || item.truckId || item.truck_id || truckId,
      serviceType: item.serviceType || item.maintenanceType || item.service_type || 'PREVENTIVE',
      title: item.title || item.maintenance_type || `${item.serviceType || 'Service'} Record`,
      description: item.notes || item.description || '',
      odometerAtService: Number(item.odometerReading ?? item.odometer_reading ?? item.odometer ?? 0),
      completedAt: item.serviceDate || item.performedAt || item.performed_at || item.completedAt || new Date().toISOString(),
      cost: item.cost !== undefined ? Number(item.cost) : undefined,
    }));
  },

  async fetchFuelHistory(truckId: string): Promise<FuelLog[]> {
    if (ENV.USE_MOCK) {
      await delay(150);
      return MOCK_PAST_FUEL_LOGS;
    }

    const res = await apiClient<any>(`/operations/fuel?truckId=${truckId}`, {
      method: 'GET',
    });
    const rawList = res.data?.logs || res.data || [];
    if (!Array.isArray(rawList)) return [];
    return rawList.map((item: any) => ({
      id: String(item.id),
      truck_id: item.vehicleId || item.truckId || item.truck_id || truckId,
      driver_id: item.driverId || item.driver_id || '',
      liters: Number(item.litersPumped ?? item.liters ?? 0),
      total_cost: Number(item.totalCost ?? item.total_cost ?? 0),
      odometer: Number(item.odometerReading ?? item.odometer_reading ?? item.odometer ?? 0),
      receipt_photo_uri: item.receiptMediaKey || item.receiptPhotoUri || item.receipt_photo_uri || null,
      logged_at: item.fueledAt || item.loggedAt || item.logged_at || new Date().toISOString(),
      synced: true,
    }));
  },
};
