import { socketClient } from './socketClient';
import { tripRepository, driverRepository } from '@/database';
import { tripApi, driverApi } from '@/api';
import { authService } from '@/services/authService';
import { DriverShift, VehicleTelemetry } from '@/types';

export type DriverRealtimeEventType =
  | 'TRIP_DISPATCHED'
  | 'TRIP_LOAD_RECORDED'
  | 'VEHICLE_STOCK_UPDATED'
  | 'TRIP_COMPLETED'
  | 'TRIP_CANCELLED'
  | 'TRIP_RECONCILED'
  | 'VEHICLE_DRIVER_ASSIGNED'
  | 'VEHICLE_DRIVER_UNASSIGNED'
  | 'FLEET_VEHICLE_GROUNDED'
  | 'FLEET_VEHICLE_RELEASED'
  | 'VEHICLE_STATUS_UPDATED'
  | 'ATTENDANCE_DUTY_UPDATED'
  | 'EMERGENCY_ALERT_STATUS_UPDATED'
  | 'APPREHENSION_STATUS_UPDATED';

export type DriverRealtimeListener = (event: DriverRealtimeEventType, data: any) => void;

class DriverRealtimeManager {
  private listeners: Set<DriverRealtimeListener> = new Set();
  private unbinders: (() => void)[] = [];
  private initialized: boolean = false;

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Ensure socketClient is initialized
    socketClient.init();

    // 1. Trips & Route Planning Events
    this.bindEvent('TRIP_DISPATCHED', async (data) => {
      console.log('[DriverRealtime] TRIP_DISPATCHED received:', data?.tripNumber);
      try {
        const session = await authService.getSession();
        const currentUserId = session?.id;

        // If dispatched to this driver or broadly available
        if (!data?.driverUserId || !currentUserId || data.driverUserId === currentUserId) {
          const assignment = await tripApi.fetchActiveAssignment();
          if (assignment?.trip && assignment.trip.id) {
            const rawTrip = assignment.trip as any;
            const tripId = rawTrip.id;
            const tripNumber = rawTrip.tripNumber || rawTrip.trip_number || `TRIP-${tripId.substring(0, 8)}`;
            const userDisplayName = session ? [session.firstName, session.lastName].filter(Boolean).join(' ') || session.username : 'Driver';

            await tripRepository.saveActiveTrip({
              trip_id: tripId,
              trip_number: tripNumber,
              vehicle_plate: rawTrip.truckPlateNumber || rawTrip.truck_plate_number || data?.vehiclePlate || 'N/A',
              driver_name: rawTrip.driverName || rawTrip.driver_name || userDisplayName,
              sales_user_id: rawTrip.salesUserId || rawTrip.sales_user_id || 'UNKNOWN',
              zone_id: rawTrip.zoneId || rawTrip.zone_id || 'DEFAULT',
              status: rawTrip.status || 'IN_PROGRESS',
              dispatched_at: rawTrip.departureTime || rawTrip.departure_time || data?.dispatchedAt || new Date().toISOString(),
              truck_id: rawTrip.truckId || rawTrip.truck_id || data?.vehicleId || null,
              truck_model: rawTrip.truckModel || rawTrip.truck_model || null,
              driver_id: rawTrip.driverId || rawTrip.driver_id || currentUserId,
              sales_user_name: rawTrip.salesUserName || rawTrip.sales_user_name || null,
              zone_name: rawTrip.zoneName || rawTrip.zone_name || null,
            });
          }
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error hydrating dispatched trip:', e);
      }
      this.notifyListeners('TRIP_DISPATCHED', data);
    });

    this.bindEvent('TRIP_LOAD_RECORDED', async (data) => {
      console.log('[DriverRealtime] TRIP_LOAD_RECORDED received:', data?.slipNumber);
      this.notifyListeners('TRIP_LOAD_RECORDED', data);
    });

    this.bindEvent('VEHICLE_STOCK_UPDATED', async (data) => {
      console.log('[DriverRealtime] VEHICLE_STOCK_UPDATED received:', data?.action);
      this.notifyListeners('VEHICLE_STOCK_UPDATED', data);
    });

    this.bindEvent('TRIP_COMPLETED', async (data) => {
      console.log('[DriverRealtime] TRIP_COMPLETED received:', data?.tripNumber);
      try {
        const active = await tripRepository.getActiveTrip();
        if (!data?.tripId || active?.trip_id === data.tripId) {
          await tripRepository.clearActiveTrip();
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error handling trip completion:', e);
      }
      this.notifyListeners('TRIP_COMPLETED', data);
    });

    this.bindEvent('TRIP_CANCELLED', async (data) => {
      console.log('[DriverRealtime] TRIP_CANCELLED received:', data?.tripNumber, 'Reason:', data?.reason);
      try {
        const active = await tripRepository.getActiveTrip();
        if (!data?.tripId || active?.trip_id === data.tripId) {
          await tripRepository.clearActiveTrip();
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error handling trip cancellation:', e);
      }
      this.notifyListeners('TRIP_CANCELLED', data);
    });

    this.bindEvent('TRIP_RECONCILED', async (data) => {
      console.log('[DriverRealtime] TRIP_RECONCILED received:', data?.tripNumber);
      try {
        const active = await tripRepository.getActiveTrip();
        if (!data?.tripId || active?.trip_id === data.tripId) {
          await tripRepository.clearActiveTrip();
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error handling trip reconciliation:', e);
      }
      this.notifyListeners('TRIP_RECONCILED', data);
    });

    // 2. Fleet Assets & Vehicle Readiness Events
    this.bindEvent('VEHICLE_DRIVER_ASSIGNED', async (data) => {
      console.log('[DriverRealtime] VEHICLE_DRIVER_ASSIGNED received:', data?.plateNumber);
      try {
        const session = await authService.getSession();
        if (!data?.driverUserId || data.driverUserId === session?.id) {
          const myVehicle = await driverApi.fetchMyVehicle();
          if (myVehicle) {
            await driverRepository.saveVehicleTelemetry(myVehicle);
          }
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error handling vehicle assignment:', e);
      }
      this.notifyListeners('VEHICLE_DRIVER_ASSIGNED', data);
    });

    this.bindEvent('VEHICLE_DRIVER_UNASSIGNED', async (data) => {
      console.log('[DriverRealtime] VEHICLE_DRIVER_UNASSIGNED received:', data?.plateNumber);
      this.notifyListeners('VEHICLE_DRIVER_UNASSIGNED', data);
    });

    this.bindEvent('FLEET_VEHICLE_GROUNDED', async (data) => {
      console.log('[DriverRealtime] FLEET_VEHICLE_GROUNDED received:', data?.plateNumber, 'Findings:', data?.findings);
      try {
        const telem = await driverRepository.getVehicleTelemetry();
        if (telem && (!data?.vehicleId || telem.truck_id === data.vehicleId || telem.plate_number === data.plateNumber)) {
          const updated: VehicleTelemetry = {
            ...telem,
            status: 'UNDER_MAINTENANCE',
          };
          await driverRepository.saveVehicleTelemetry(updated);
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error updating grounded telemetry:', e);
      }
      this.notifyListeners('FLEET_VEHICLE_GROUNDED', data);
    });

    this.bindEvent('FLEET_VEHICLE_RELEASED', async (data) => {
      console.log('[DriverRealtime] FLEET_VEHICLE_RELEASED received:', data?.plateNumber);
      try {
        const telem = await driverRepository.getVehicleTelemetry();
        if (telem && (!data?.vehicleId || telem.truck_id === data.vehicleId || telem.plate_number === data.plateNumber)) {
          const updated: VehicleTelemetry = {
            ...telem,
            status: 'ACTIVE',
          };
          await driverRepository.saveVehicleTelemetry(updated);
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error updating released telemetry:', e);
      }
      this.notifyListeners('FLEET_VEHICLE_RELEASED', data);
    });

    this.bindEvent('VEHICLE_STATUS_UPDATED', async (data) => {
      console.log('[DriverRealtime] VEHICLE_STATUS_UPDATED received:', data?.plateNumber, 'Status:', data?.status);
      try {
        const telem = await driverRepository.getVehicleTelemetry();
        if (telem && (!data?.vehicleId || telem.truck_id === data.vehicleId || telem.plate_number === data.plateNumber)) {
          const updated: VehicleTelemetry = {
            ...telem,
            status: data.status || telem.status,
          };
          await driverRepository.saveVehicleTelemetry(updated);
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error updating telemetry status:', e);
      }
      this.notifyListeners('VEHICLE_STATUS_UPDATED', data);
    });

    // 3. Duty Attendance Events
    this.bindEvent('ATTENDANCE_DUTY_UPDATED', async (data) => {
      console.log('[DriverRealtime] ATTENDANCE_DUTY_UPDATED received:', data?.status || data?.type);
      try {
        const session = await authService.getSession();
        const targetUserId = data?.userId || session?.id;
        if (!data?.userId || data.userId === session?.id) {
          const isOnDuty =
            data?.status === 'ON_DUTY' ||
            data?.status === 'ACTIVE' ||
            data?.type === 'CLOCK_IN';

          if (isOnDuty) {
            const shift: DriverShift = {
              id: data?.attendanceId || `shift-${Date.now()}`,
              driver_id: session?.id || targetUserId || '',
              status: 'ON_DUTY',
              clock_in_time: data?.clockInTime || data?.timestamp || new Date().toISOString(),
              clock_out_time: null,
              synced: true,
            };
            await driverRepository.saveShift(shift);
          } else {
            const clockOutTime =
              data?.clockOutTime ||
              data?.clockOut ||
              data?.timestamp ||
              new Date().toISOString();
            if (session?.id) {
              await driverRepository.closeAllDriverShifts(session.id, clockOutTime);
            }
            if (targetUserId && targetUserId !== session?.id) {
              await driverRepository.closeAllDriverShifts(targetUserId, clockOutTime);
            }
          }
        }
      } catch (e) {
        console.warn('[DriverRealtime] Error updating shift attendance from socket:', e);
      }
      this.notifyListeners('ATTENDANCE_DUTY_UPDATED', data);
    });

    // 4. Emergency Alert & Apprehension Events
    this.bindEvent('EMERGENCY_ALERT_STATUS_UPDATED', (data) => {
      console.log('[DriverRealtime] EMERGENCY_ALERT_STATUS_UPDATED received:', data?.status, 'by:', data?.acknowledgedByName);
      this.notifyListeners('EMERGENCY_ALERT_STATUS_UPDATED', data);
    });

    this.bindEvent('APPREHENSION_STATUS_UPDATED', (data) => {
      console.log('[DriverRealtime] APPREHENSION_STATUS_UPDATED received:', data?.status);
      this.notifyListeners('APPREHENSION_STATUS_UPDATED', data);
    });
  }

  private bindEvent(event: DriverRealtimeEventType, handler: (data: any) => Promise<void> | void): void {
    const unbind = socketClient.on(event, async (data) => {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[DriverRealtime] Handler error for ${event}:`, err);
      }
    });
    this.unbinders.push(unbind);
  }

  public subscribe(listener: DriverRealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: DriverRealtimeEventType, data: any): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (err) {
        console.error(`[DriverRealtime] Listener error on event ${event}:`, err);
      }
    });
  }

  public destroy(): void {
    this.unbinders.forEach((un) => un());
    this.unbinders = [];
    this.listeners.clear();
    this.initialized = false;
  }
}

export const driverRealtimeManager = new DriverRealtimeManager();
