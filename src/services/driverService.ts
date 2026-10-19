import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import {
  driverRepository,
  tripRepository,
  syncQueueRepository,
} from '@/database';
import { driverApi, tripApi } from '@/api';
import { UUID_REGEX } from '@/api/endpoints/driverApi';
import {
  UserSession,
  DriverShift,
  VehicleTelemetry,
  FuelLog,
  ApprehensionReport,
  VehicleIssueReport,
  EmergencyAlertPayload,
  EmergencyType,
  ApprehendingAgency,
  IssueSeverity,
  MaintenanceServiceLogItem,
  ActiveTrip,
} from '@/types';
import { mediaService } from './mediaService';
import { MOCK_VEHICLE_TELEMETRY, MOCK_MAINTENANCE_LOGS } from '@/api/mockData';
import { networkSentinel } from '@/sync/networkSentinel';
import { ENV } from '@/config';
import { driverRealtimeManager, DriverRealtimeListener } from '@/realtime';

export interface DriverDashboardContext {
  trip: ActiveTrip | null;
  shift: DriverShift | null;
  telemetry: VehicleTelemetry;
  pendingSyncCount: number;
}

export interface VehicleHealthData {
  telemetry: VehicleTelemetry;
  fuelLogs: FuelLog[];
  maintenanceLogs: MaintenanceServiceLogItem[];
}

export const driverService = {
  /**
   * Initializes and retrieves dashboard operational context for the driver.
   */
  async getDashboardContext(user: UserSession): Promise<DriverDashboardContext> {
    // 1. Check or hydrate active trip
    let activeTrip = await tripRepository.getActiveTrip();
    if (!activeTrip && networkSentinel.isOnline()) {
      try {
        const assignment = await tripApi.fetchActiveAssignment();
        if (assignment?.trip && assignment.trip.id) {
          const rawTrip = assignment.trip as any;
          const tripId = rawTrip.id;
          const tripNumber =
            rawTrip.tripNumber ||
            rawTrip.trip_number ||
            `TRIP-${tripId.substring(0, 8)}`;
          const userDisplayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Driver';
          activeTrip = {
            trip_id: tripId,
            trip_number: tripNumber,
            vehicle_plate: rawTrip.truckPlateNumber || rawTrip.truck_plate_number || 'N/A',
            driver_name: rawTrip.driverName || rawTrip.driver_name || userDisplayName,
            sales_user_id: rawTrip.salesUserId || rawTrip.sales_user_id || user.id,
            zone_id: rawTrip.zoneId || rawTrip.zone_id || 'DEFAULT',
            status: rawTrip.status || 'IN_PROGRESS',
            dispatched_at: rawTrip.departureTime || rawTrip.departure_time || new Date().toISOString(),
            truck_id: rawTrip.truckId || rawTrip.truck_id || null,
            truck_model: rawTrip.truckModel || rawTrip.truck_model || null,
            driver_id: rawTrip.driverId || rawTrip.driver_id || user.id,
            sales_user_name: rawTrip.salesUserName || rawTrip.sales_user_name || null,
            zone_name: rawTrip.zoneName || rawTrip.zone_name || null,
          };
          await tripRepository.saveActiveTrip(activeTrip);
        }
      } catch (e) {
        console.warn('[DriverService] Could not fetch remote assignment:', e);
      }
    }

    // 2. Fetch driver's assigned vehicle telemetry (remote first if online, then local cache fallback)
    let telemetry: VehicleTelemetry | null = null;
    if (networkSentinel.isOnline()) {
      try {
        const myVehicle = await driverApi.fetchMyVehicle();
        if (myVehicle) {
          await driverRepository.saveVehicleTelemetry(myVehicle);
          telemetry = myVehicle;
        }
      } catch (e) {
        console.warn('[DriverService] Remote fetchMyVehicle failed, falling back to local database:', e);
      }
    }

    if (!telemetry) {
      telemetry = await driverRepository.getVehicleTelemetry();
    }

    if (!telemetry) {
      if (ENV.USE_MOCK) {
        telemetry = MOCK_VEHICLE_TELEMETRY;
      } else {
        telemetry = {
          truck_id: activeTrip?.truck_id || '',
          plate_number: activeTrip?.vehicle_plate || 'N/A',
          model: activeTrip?.truck_model || 'Delivery Truck',
          current_odometer: 0,
          last_pm_odometer: 0,
          status: 'ACTIVE',
          isPmDue: false,
          distanceSinceLastPm: 0,
          remainingKmBeforePm: 5000,
          last_serviced_at: null,
        };
      }
    }

    // 3. Fetch active shift
    let shift = await driverRepository.getActiveShift(user.id);

    // 4. Fetch pending sync count
    const pendingSyncCount = await syncQueueRepository.getPendingCount(user.id);

    return {
      trip: activeTrip,
      shift,
      telemetry,
      pendingSyncCount,
    };
  },

  /**
   * Clock in (Start Shift)
   */
  async clockIn(user: UserSession, truckId?: string): Promise<DriverShift> {
    const shiftId = Crypto.randomUUID();
    const now = new Date().toISOString();

    const localTelem = await driverRepository.getVehicleTelemetry();
    const activeTrip = await tripRepository.getActiveTrip();
    const effectiveTruckId = truckId || localTelem?.truck_id || activeTrip?.truck_id || '';

    const shift: DriverShift = {
      id: shiftId,
      driver_id: user.id,
      status: 'ON_DUTY',
      clock_in_time: now,
      clock_out_time: null,
      synced: false,
    };

    // Save locally immediately
    await driverRepository.saveShift(shift);

    let postedDirectly = false;
    if (networkSentinel.isOnline()) {
      try {
        const resp = await driverApi.clockIn(user.id, effectiveTruckId);
        if (resp.shiftId && resp.shiftId !== shift.id) {
          shift.id = resp.shiftId;
        }
        shift.synced = true;
        await driverRepository.saveShift(shift);
        postedDirectly = true;
      } catch (e: any) {
        console.warn('[DriverService] Remote clock-in failed, queued offline:', e.message);
      }
    }

    if (!postedDirectly) {
      await syncQueueRepository.enqueue({
        id: shift.id,
        user_id: user.id,
        operation_type: 'CLOCK_IN',
        endpoint: '/attendance/clock-in',
        payload: JSON.stringify({
          userId: user.id,
          driverId: user.id,
          truckId: effectiveTruckId,
          clockInTime: now,
          timestamp: now,
        }),
      });
    }

    return shift;
  },

  /**
   * Clock out (End Shift)
   */
  async clockOut(user: UserSession): Promise<DriverShift> {
    const existing = await driverRepository.getActiveShift(user.id);
    const shiftId = existing?.id || Crypto.randomUUID();
    const now = new Date().toISOString();

    const shift: DriverShift = {
      id: shiftId,
      driver_id: user.id,
      status: 'OFF_DUTY',
      clock_in_time: existing?.clock_in_time || null,
      clock_out_time: now,
      synced: false,
    };

    await driverRepository.saveShift(shift);

    let postedDirectly = false;
    if (networkSentinel.isOnline()) {
      try {
        await driverApi.clockOut(user.id, shiftId);
        shift.synced = true;
        await driverRepository.saveShift(shift);
        postedDirectly = true;
      } catch (e: any) {
        console.warn('[DriverService] Remote clock-out failed, queued offline:', e.message);
      }
    }

    if (!postedDirectly) {
      const isShiftIdUuid = Boolean(shiftId && UUID_REGEX.test(shiftId));
      const payload: Record<string, any> = {
        userId: user.id,
        driverId: user.id,
        clockOutTime: now,
        timestamp: now,
      };
      if (isShiftIdUuid) {
        payload.attendanceId = shiftId;
        payload.shiftId = shiftId;
      }

      await syncQueueRepository.enqueue({
        id: Crypto.randomUUID(),
        user_id: user.id,
        operation_type: 'CLOCK_OUT',
        endpoint: '/attendance/clock-out',
        payload: JSON.stringify(payload),
      });
    }

    return shift;
  },

  /**
   * Emergency SOS Dispatch
   */
  async triggerEmergencySos(
    user: UserSession,
    emergencyType: EmergencyType = 'ACCIDENT',
    description: string = 'Driver pressed emergency SOS in cabin.'
  ): Promise<any> {
    let latitude: number | null = 7.1907; // Davao refilling plant baseline fallback
    let longitude: number | null = 125.4553;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }
    } catch (e) {
      console.warn('[DriverService] Could not obtain GPS coordinates:', e);
    }

    const activeTrip = await tripRepository.getActiveTrip();
    const localTelemetry = await driverRepository.getVehicleTelemetry();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let vehicleId = localTelemetry?.truck_id || activeTrip?.truck_id || '';

    const alertPayload: EmergencyAlertPayload = {
      driverId: user.id,
      vehicleId: UUID_REGEX.test(vehicleId) ? vehicleId : '',
      tripId: activeTrip?.trip_id && UUID_REGEX.test(activeTrip.trip_id) ? activeTrip.trip_id : null,
      emergencyType,
      description,
      location: { latitude, longitude },
    };

    const alertId = `sos-${Date.now()}`;

    // Life-critical Emergency SOS: Always attempt direct HTTP dispatch first
    try {
      const result = await driverApi.triggerEmergencyAlert(alertPayload);
      return result;
    } catch (e: any) {
      console.warn('[DriverService] Direct SOS attempt failed/offline, queueing for automatic delivery:', e.message);
    }

    await syncQueueRepository.enqueue({
      id: alertId,
      user_id: user.id,
      operation_type: 'EMERGENCY_SOS',
      endpoint: '/operations/alerts',
      payload: JSON.stringify({
        driverId: user.id,
        emergencyType,
        description,
        latitude,
        longitude,
        ...(UUID_REGEX.test(vehicleId) ? { vehicleId } : {}),
        ...(activeTrip?.trip_id && UUID_REGEX.test(activeTrip.trip_id) ? { tripId: activeTrip.trip_id } : {}),
      }),
    });

    return {
      id: alertId,
      status: 'QUEUED_OFFLINE',
      message: 'Emergency SOS queued locally. Will transmit automatically when connectivity is restored.',
    };
  },

  /**
   * Log Fuel Intake
   */
  async logFuel(
    user: UserSession,
    data: {
      liters: number;
      totalCost: number;
      odometer: number;
      receiptPhotoUri?: string | null;
      truckId?: string;
    }
  ): Promise<{ fuelLog: FuelLog; telemetry: VehicleTelemetry }> {
    const localTelemetry = await driverRepository.getVehicleTelemetry();
    const activeTrip = await tripRepository.getActiveTrip();
    const truckId = data.truckId || localTelemetry?.truck_id || activeTrip?.truck_id || '';

    // 1. Monotonic validation
    const currentTelemetry = truckId ? await driverRepository.getVehicleTelemetry(truckId) : localTelemetry;
    const baselineOdo = currentTelemetry?.current_odometer || 0;
    if (data.odometer < baselineOdo) {
      throw new Error(
        `Odometer reading (${data.odometer.toLocaleString()} km) cannot be lower than current vehicle odometer (${baselineOdo.toLocaleString()} km).`
      );
    }

    // 2. Compress and cache receipt photo if provided
    let cachedPhotoUri: string | null = null;
    let receiptMediaKey: string | null = null;
    if (data.receiptPhotoUri) {
      const cached = await mediaService.processAndCacheImage(data.receiptPhotoUri, 'fuel_receipt');
      cachedPhotoUri = cached.localUri;
      if (networkSentinel.isOnline()) {
        try {
          const uploadRes = await mediaService.uploadMedia(cached.localUri, 'maintenance/receipts');
          receiptMediaKey = uploadRes.storageKey;
        } catch (err) {
          console.warn('[DriverService] Remote receipt upload postponed to sync:', err);
        }
      }
    }

    const logId = `fuel-${Date.now()}`;
    const now = new Date().toISOString();

    const fuelLog: FuelLog = {
      id: logId,
      truck_id: truckId,
      driver_id: user.id,
      liters: data.liters,
      total_cost: data.totalCost,
      odometer: data.odometer,
      receipt_photo_uri: cachedPhotoUri,
      logged_at: now,
      synced: false,
    };

    // 3. Atomic local writes: Save fuel log & update telemetry odometer
    await driverRepository.saveFuelLog(fuelLog);
    if (truckId) {
      await driverRepository.updateOdometer(truckId, data.odometer);
    }

    // 4. Try remote post or queue
    const payload = {
      truckId,
      vehicleId: truckId,
      driverId: user.id,
      liters: data.liters,
      litersPumped: data.liters,
      totalCost: data.totalCost,
      odometer: data.odometer,
      odometerReading: data.odometer,
      receiptPhotoUri: cachedPhotoUri,
      receiptMediaKey: receiptMediaKey || cachedPhotoUri,
      fueledAt: now,
      timestamp: now,
    };

    let postedDirectly = false;
    if (networkSentinel.isOnline()) {
      try {
        await driverApi.postFuelLog(payload);
        fuelLog.synced = true;
        await driverRepository.markFuelLogSynced(logId);
        postedDirectly = true;
      } catch (e: any) {
        console.warn('[DriverService] Remote fuel log failed, queued offline:', e.message);
      }
    }

    if (!postedDirectly) {
      await syncQueueRepository.enqueue({
        id: logId,
        user_id: user.id,
        operation_type: 'LOG_FUEL',
        endpoint: '/operations/fuel',
        payload: JSON.stringify(payload),
      });
    }

    const updatedTelemetry = truckId
      ? await driverRepository.getVehicleTelemetry(truckId)
      : await driverRepository.getVehicleTelemetry();

    const fallbackTelem: VehicleTelemetry = {
      truck_id: truckId,
      plate_number: activeTrip?.vehicle_plate || 'N/A',
      model: activeTrip?.truck_model || 'Delivery Truck',
      current_odometer: data.odometer,
      last_pm_odometer: currentTelemetry?.last_pm_odometer || 0,
      status: 'ACTIVE',
      isPmDue: false,
      distanceSinceLastPm: Math.max(0, data.odometer - (currentTelemetry?.last_pm_odometer || 0)),
      remainingKmBeforePm: Math.max(0, 5000 - Math.max(0, data.odometer - (currentTelemetry?.last_pm_odometer || 0))),
      last_serviced_at: null,
    };

    return {
      fuelLog,
      telemetry: updatedTelemetry || (ENV.USE_MOCK ? MOCK_VEHICLE_TELEMETRY : fallbackTelem),
    };
  },

  /**
   * Report Roadside Traffic Apprehension / Citation
   */
  async reportApprehension(
    user: UserSession,
    data: {
      agency: ApprehendingAgency;
      violationNotes: string;
      citationNumber?: string | null;
      fineAmount?: number | null;
      ticketPhotoUri: string; // Mandatory
      truckId?: string;
    }
  ): Promise<ApprehensionReport> {
    if (!data.ticketPhotoUri) {
      throw new Error('Mandatory citation ticket photo proof is required before submission.');
    }

    const localTelemetry = await driverRepository.getVehicleTelemetry();
    const activeTrip = await tripRepository.getActiveTrip();
    const truckId = data.truckId || localTelemetry?.truck_id || activeTrip?.truck_id || '';

    // Compress & cache mandatory ticket photo
    const cached = await mediaService.processAndCacheImage(data.ticketPhotoUri, 'citation_ticket');
    let ticketMediaKey: string | null = null;
    if (networkSentinel.isOnline()) {
      try {
        const uploadRes = await mediaService.uploadMedia(cached.localUri, 'fleet/apprehensions');
        ticketMediaKey = uploadRes.storageKey;
      } catch (err) {
        console.warn('[DriverService] Ticket upload postponed to sync:', err);
      }
    }

    const reportId = `citation-${Date.now()}`;
    const now = new Date().toISOString();

    const report: ApprehensionReport = {
      id: reportId,
      truck_id: truckId,
      driver_id: user.id,
      agency: data.agency,
      citation_number: data.citationNumber || null,
      violation_notes: data.violationNotes,
      fine_amount: data.fineAmount || null,
      ticket_photo_uri: cached.localUri,
      reported_at: now,
      synced: false,
    };

    await driverRepository.saveApprehension(report);

    const payload = {
      truckId,
      vehicleId: truckId,
      driverId: user.id,
      agency: data.agency,
      citationNumber: data.citationNumber || null,
      violationType: data.violationNotes || 'TRAFFIC_CITATION',
      violationNotes: data.violationNotes,
      fineAmount: data.fineAmount || null,
      ticketPhotoUri: cached.localUri,
      ticketMediaKey: ticketMediaKey || cached.localUri,
      reportedAt: now,
      timestamp: now,
    };

    let postedDirectly = false;
    if (networkSentinel.isOnline()) {
      try {
        await driverApi.postApprehension(payload);
        report.synced = true;
        await driverRepository.markApprehensionSynced(reportId);
        postedDirectly = true;
      } catch (e: any) {
        console.warn('[DriverService] Remote apprehension failed, queued offline:', e.message);
      }
    }

    if (!postedDirectly) {
      await syncQueueRepository.enqueue({
        id: reportId,
        user_id: user.id,
        operation_type: 'REPORT_APPREHENSION',
        endpoint: '/operations/apprehensions',
        payload: JSON.stringify(payload),
      });
    }

    return report;
  },

  /**
   * Report Vehicle Issue / Breakdown
   */
  async reportVehicleIssue(
    user: UserSession,
    data: {
      incidentType: string;
      description: string;
      severity: IssueSeverity;
      photoUri?: string | null;
      truckId?: string;
    }
  ): Promise<VehicleIssueReport> {
    const localTelemetry = await driverRepository.getVehicleTelemetry();
    const activeTrip = await tripRepository.getActiveTrip();
    const truckId = data.truckId || localTelemetry?.truck_id || activeTrip?.truck_id || '';

    let cachedPhotoUri: string | null = null;
    let photoMediaKey: string | null = null;
    if (data.photoUri) {
      const cached = await mediaService.processAndCacheImage(data.photoUri, 'incident');
      cachedPhotoUri = cached.localUri;
      if (networkSentinel.isOnline()) {
        try {
          const uploadRes = await mediaService.uploadMedia(cached.localUri, 'maintenance/incidents');
          photoMediaKey = uploadRes.storageKey;
        } catch (err) {
          console.warn('[DriverService] Incident photo upload postponed to sync:', err);
        }
      }
    }

    const issueId = `incident-${Date.now()}`;
    const now = new Date().toISOString();

    const issue: VehicleIssueReport = {
      id: issueId,
      truck_id: truckId,
      driver_id: user.id,
      incident_type: data.incidentType,
      description: data.description,
      severity: data.severity,
      photo_uri: cachedPhotoUri,
      reported_at: now,
      synced: false,
    };

    await driverRepository.saveVehicleIssue(issue);

    // Map incident type string to integer ID for backend compatibility
    const typeUpper = (data.incidentType || '').toUpperCase();
    let incidentTypeId = 1; // Default MECHANICAL_DEFECT
    if (typeUpper.includes('ACCIDENT') || typeUpper.includes('CRASH')) {
      incidentTypeId = 2; // ROAD_ACCIDENT
    } else if (typeUpper.includes('TIRE') || typeUpper.includes('PUNCTURE') || typeUpper.includes('FLAT')) {
      incidentTypeId = 3; // TIRE_FAILURE
    } else if (typeUpper.includes('LEAK') || typeUpper.includes('OIL') || typeUpper.includes('GAS')) {
      incidentTypeId = 4; // LEAK_ISSUE
    }

    const payload = {
      truckId,
      vehicleId: truckId,
      driverId: user.id,
      incidentTypeId,
      incidentType: data.incidentType,
      description: data.description,
      severity: data.severity,
      photoUri: cachedPhotoUri,
      photoMediaKey: photoMediaKey || cachedPhotoUri,
      reportDate: now,
      timestamp: now,
    };

    let postedDirectly = false;
    if (networkSentinel.isOnline()) {
      try {
        await driverApi.postVehicleIncident(payload);
        issue.synced = true;
        await driverRepository.markVehicleIssueSynced(issueId);
        postedDirectly = true;
      } catch (e: any) {
        console.warn('[DriverService] Remote incident report failed, queued offline:', e.message);
      }
    }

    if (!postedDirectly) {
      await syncQueueRepository.enqueue({
        id: issueId,
        user_id: user.id,
        operation_type: 'REPORT_ISSUE',
        endpoint: '/fleet/maintenance/incidents',
        payload: JSON.stringify(payload),
      });
    }

    return issue;
  },

  /**
   * Query Vehicle Health, PM status, and historical logs
   */
  async getVehicleHealthData(truckId?: string): Promise<VehicleHealthData> {
    let resolvedTruckId = truckId;
    if (!resolvedTruckId) {
      const cached = await driverRepository.getVehicleTelemetry();
      if (cached?.truck_id) {
        resolvedTruckId = cached.truck_id;
      }
    }

    let telemetry = resolvedTruckId ? await driverRepository.getVehicleTelemetry(resolvedTruckId) : null;
    if (!telemetry && networkSentinel.isOnline()) {
      try {
        telemetry = await driverApi.fetchMyVehicle();
        if (telemetry) {
          await driverRepository.saveVehicleTelemetry(telemetry);
          resolvedTruckId = telemetry.truck_id;
        }
      } catch (err) {
        console.warn('[DriverService] Could not fetch my vehicle:', err);
      }
    }

    const activeTrip = await tripRepository.getActiveTrip();
    const effectiveTruckId = resolvedTruckId || telemetry?.truck_id || activeTrip?.truck_id || '';

    let localFuel: FuelLog[] = [];
    try {
      localFuel = effectiveTruckId
        ? await driverRepository.getFuelLogs(effectiveTruckId)
        : await driverRepository.getFuelLogs();
    } catch (e) {
      console.warn('[DriverService] Error getting local fuel logs:', e);
    }

    let fuelLogs = Array.isArray(localFuel) ? localFuel : [];
    if (fuelLogs.length === 0 && effectiveTruckId && networkSentinel.isOnline()) {
      try {
        const remoteFuel = await driverApi.fetchFuelHistory(effectiveTruckId);
        if (Array.isArray(remoteFuel)) {
          fuelLogs = remoteFuel;
          for (const log of remoteFuel) {
            await driverRepository.saveFuelLog(log);
          }
        }
      } catch (e) {
        console.warn('[DriverService] Error fetching remote fuel history:', e);
      }
    }

    let maintenanceLogs: MaintenanceServiceLogItem[] = [];
    if (effectiveTruckId && networkSentinel.isOnline()) {
      try {
        const remoteLogs = await driverApi.fetchMaintenanceLogs(effectiveTruckId);
        if (Array.isArray(remoteLogs)) {
          maintenanceLogs = remoteLogs;
        }
      } catch (e) {
        console.warn('[DriverService] Error fetching maintenance logs:', e);
      }
    }

    if (maintenanceLogs.length === 0 && ENV.USE_MOCK) {
      maintenanceLogs = MOCK_MAINTENANCE_LOGS;
    }

    const defaultTelemetry: VehicleTelemetry = {
      truck_id: effectiveTruckId,
      plate_number: activeTrip?.vehicle_plate || 'N/A',
      model: activeTrip?.truck_model || 'Delivery Truck',
      current_odometer: 0,
      last_pm_odometer: 0,
      status: 'ACTIVE',
      isPmDue: false,
      distanceSinceLastPm: 0,
      remainingKmBeforePm: 5000,
      last_serviced_at: null,
    };

    return {
      telemetry: telemetry || (ENV.USE_MOCK ? MOCK_VEHICLE_TELEMETRY : defaultTelemetry),
      fuelLogs: Array.isArray(fuelLogs) ? fuelLogs : [],
      maintenanceLogs: Array.isArray(maintenanceLogs) ? maintenanceLogs : [],
    };
  },

  /**
   * Subscribe to live frontline driver real-time socket events.
   */
  subscribeRealtime(listener: DriverRealtimeListener): () => void {
    driverRealtimeManager.init();
    return driverRealtimeManager.subscribe(listener);
  },
};
