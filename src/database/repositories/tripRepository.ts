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

  async saveActiveTrip(trip: ActiveTrip): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO local_active_trip (
        trip_id, trip_number, truck_id, truck_model, vehicle_plate, driver_id, driver_name,
        sales_user_id, sales_user_name, zone_id, zone_name, status, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        trip.trip_id,
        trip.trip_number,
        trip.truck_id || null,
        trip.truck_model || null,
        trip.vehicle_plate,
        trip.driver_id || null,
        trip.driver_name,
        trip.sales_user_id,
        trip.sales_user_name || null,
        trip.zone_id,
        trip.zone_name || null,
        trip.status,
        trip.dispatched_at,
      ]
    );
  },

  async clearActiveTrip(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM local_active_trip;');
  },
};
