import { getDatabase } from '../connection';
import { ActiveTrip } from '@/types';

export const tripRepository = {
  async getActiveTrip(): Promise<ActiveTrip | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ActiveTrip>(
      'SELECT * FROM local_active_trip LIMIT 1;'
    );
    return row || null;
  },

  async getActiveTripForUser(userId: string): Promise<ActiveTrip | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ActiveTrip>(
      'SELECT * FROM local_active_trip WHERE sales_user_id = ? OR driver_id = ? LIMIT 1;',
      [userId, userId]
    );
    return row || null;
  },

  async saveActiveTrip(trip: ActiveTrip): Promise<void> {
    const db = await getDatabase();
    const effectiveTripId = trip.trip_id || `TRIP-LOCAL-${Date.now()}`;
    const effectiveTripNumber = trip.trip_number || `TRIP-${effectiveTripId.substring(0, 8)}`;
    await db.runAsync(
      `INSERT OR REPLACE INTO local_active_trip (
        trip_id, trip_number, truck_id, truck_model, vehicle_plate, driver_id, driver_name,
        sales_user_id, sales_user_name, zone_id, zone_name, status, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        effectiveTripId,
        effectiveTripNumber,
        trip.truck_id || null,
        trip.truck_model || null,
        trip.vehicle_plate || 'N/A',
        trip.driver_id || null,
        trip.driver_name || 'Driver',
        trip.sales_user_id || 'UNKNOWN',
        trip.sales_user_name || null,
        trip.zone_id || 'DEFAULT',
        trip.zone_name || null,
        trip.status || 'IN_PROGRESS',
        trip.dispatched_at || new Date().toISOString(),
      ]
    );
  },

  async clearActiveTrip(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM local_active_trip;');
  },

  async updateTripStatus(tripId: string, status: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE local_active_trip SET status = ? WHERE trip_id = ?;',
      [status, tripId]
    );
  },
};
