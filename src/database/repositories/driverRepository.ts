import { getDatabase } from '../connection';
import {
  DriverShift,
  VehicleTelemetry,
  FuelLog,
  ApprehensionReport,
  VehicleIssueReport,
} from '@/types';

export const driverRepository = {
  // ==========================================
  // 1. Shift Attendance
  // ==========================================
  async getActiveShift(driverId: string): Promise<DriverShift | null> {
    const db = await getDatabase();
    // Return the latest recorded shift for the driver by rowid (authoritative sequence)
    const row = await db.getFirstAsync<{
      id: string;
      driver_id: string;
      status: string;
      clock_in_time: string | null;
      clock_out_time: string | null;
      synced: number;
    }>(
      `SELECT * FROM local_driver_shift 
       WHERE driver_id = ? 
       ORDER BY rowid DESC LIMIT 1;`,
      [driverId]
    );

    if (!row) return null;

    return {
      id: row.id,
      driver_id: row.driver_id,
      status: row.status as any,
      clock_in_time: row.clock_in_time,
      clock_out_time: row.clock_out_time,
      synced: Boolean(row.synced),
    };
  },

  async saveShift(shift: DriverShift): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_driver_shift (
        id, driver_id, status, clock_in_time, clock_out_time, synced
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        clock_in_time = excluded.clock_in_time,
        clock_out_time = excluded.clock_out_time,
        synced = excluded.synced;`,
      [
        shift.id,
        shift.driver_id,
        shift.status,
        shift.clock_in_time || null,
        shift.clock_out_time || null,
        shift.synced ? 1 : 0,
      ]
    );
  },

  /**
   * Closes all active or open shifts for the driver in local SQLite, ensuring no orphaned ON_DUTY rows remain.
   */
  async closeAllDriverShifts(driverId: string, clockOutTime?: string): Promise<void> {
    const db = await getDatabase();
    const timestamp = clockOutTime || new Date().toISOString();
    await db.runAsync(
      `UPDATE local_driver_shift 
       SET status = 'OFF_DUTY',
           clock_out_time = COALESCE(clock_out_time, ?),
           synced = 1
       WHERE driver_id = ? AND (status = 'ON_DUTY' OR clock_out_time IS NULL);`,
      [timestamp, driverId]
    );
  },

  /**
   * Replaces a client-generated temporary shift ID with a backend-assigned ID without duplicating rows.
   */
  async replaceShiftId(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) return;
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(`DELETE FROM local_driver_shift WHERE id = ?;`, [newId]);
      await txn.runAsync(`UPDATE local_driver_shift SET id = ? WHERE id = ?;`, [newId, oldId]);
    });
  },

  // ==========================================
  // 2. Vehicle Telemetry & 5,000-km PM
  // ==========================================
  async getVehicleTelemetry(truckId?: string): Promise<VehicleTelemetry | null> {
    const db = await getDatabase();
    const row = truckId
      ? await db.getFirstAsync<{
          truck_id: string;
          plate_number: string;
          model: string;
          current_odometer: number;
          last_pm_odometer: number;
          status: string;
          last_serviced_at: string | null;
        }>(
          `SELECT * FROM local_vehicle_telemetry WHERE truck_id = ? LIMIT 1;`,
          [truckId]
        )
      : await db.getFirstAsync<{
          truck_id: string;
          plate_number: string;
          model: string;
          current_odometer: number;
          last_pm_odometer: number;
          status: string;
          last_serviced_at: string | null;
        }>(
          `SELECT * FROM local_vehicle_telemetry ORDER BY rowid DESC LIMIT 1;`
        );

    if (!row) return null;

    const distanceSinceLastPm = Math.max(0, row.current_odometer - row.last_pm_odometer);
    const isPmDue = distanceSinceLastPm >= 5000;
    const remainingKmBeforePm = Math.max(0, 5000 - distanceSinceLastPm);

    return {
      truck_id: row.truck_id,
      plate_number: row.plate_number,
      model: row.model,
      current_odometer: row.current_odometer,
      last_pm_odometer: row.last_pm_odometer,
      status: row.status as any,
      isPmDue,
      distanceSinceLastPm,
      remainingKmBeforePm,
      last_serviced_at: row.last_serviced_at,
    };
  },

  async saveVehicleTelemetry(telemetry: Omit<VehicleTelemetry, 'isPmDue' | 'distanceSinceLastPm' | 'remainingKmBeforePm'>): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_vehicle_telemetry (
        truck_id, plate_number, model, current_odometer, last_pm_odometer, status, last_serviced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(truck_id) DO UPDATE SET
        plate_number = excluded.plate_number,
        model = excluded.model,
        current_odometer = excluded.current_odometer,
        last_pm_odometer = excluded.last_pm_odometer,
        status = excluded.status,
        last_serviced_at = excluded.last_serviced_at;`,
      [
        telemetry.truck_id,
        telemetry.plate_number,
        telemetry.model,
        telemetry.current_odometer,
        telemetry.last_pm_odometer,
        telemetry.status,
        telemetry.last_serviced_at || null,
      ]
    );
  },

  async updateOdometer(truckId: string, newOdometer: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_vehicle_telemetry SET current_odometer = ? WHERE truck_id = ?;`,
      [newOdometer, truckId]
    );
  },

  // ==========================================
  // 3. Fuel Intake Logs
  // ==========================================
  async getFuelLogs(truckId?: string, limit: number = 20): Promise<FuelLog[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      truck_id: string;
      driver_id: string;
      liters: number;
      total_cost: number;
      odometer: number;
      receipt_photo_uri: string | null;
      logged_at: string;
      synced: number;
    }>(
      truckId
        ? `SELECT * FROM local_fuel_logs WHERE truck_id = ? ORDER BY logged_at DESC LIMIT ?;`
        : `SELECT * FROM local_fuel_logs ORDER BY logged_at DESC LIMIT ?;`,
      truckId ? [truckId, limit] : [limit]
    );

    return rows.map((r) => ({
      id: r.id,
      truck_id: r.truck_id,
      driver_id: r.driver_id,
      liters: r.liters,
      total_cost: r.total_cost,
      odometer: r.odometer,
      receipt_photo_uri: r.receipt_photo_uri,
      logged_at: r.logged_at,
      synced: Boolean(r.synced),
    }));
  },

  async saveFuelLog(log: FuelLog): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_fuel_logs (
        id, truck_id, driver_id, liters, total_cost, odometer, receipt_photo_uri, logged_at, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        log.id,
        log.truck_id,
        log.driver_id,
        log.liters,
        log.total_cost,
        log.odometer,
        log.receipt_photo_uri || null,
        log.logged_at,
        log.synced ? 1 : 0,
      ]
    );
  },

  // ==========================================
  // 4. Apprehensions / Citations
  // ==========================================
  async getApprehensions(truckId: string, limit: number = 20): Promise<ApprehensionReport[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      truck_id: string;
      driver_id: string;
      agency: string;
      citation_number: string | null;
      violation_notes: string;
      fine_amount: number | null;
      ticket_photo_uri: string;
      reported_at: string;
      synced: number;
    }>(
      `SELECT * FROM local_apprehensions WHERE truck_id = ? ORDER BY reported_at DESC LIMIT ?;`,
      [truckId, limit]
    );

    return rows.map((r) => ({
      id: r.id,
      truck_id: r.truck_id,
      driver_id: r.driver_id,
      agency: r.agency as any,
      citation_number: r.citation_number,
      violation_notes: r.violation_notes,
      fine_amount: r.fine_amount,
      ticket_photo_uri: r.ticket_photo_uri,
      reported_at: r.reported_at,
      synced: Boolean(r.synced),
    }));
  },

  async saveApprehension(report: ApprehensionReport): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_apprehensions (
        id, truck_id, driver_id, agency, citation_number, violation_notes, fine_amount, ticket_photo_uri, reported_at, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        report.id,
        report.truck_id,
        report.driver_id,
        report.agency,
        report.citation_number || null,
        report.violation_notes,
        report.fine_amount || null,
        report.ticket_photo_uri,
        report.reported_at,
        report.synced ? 1 : 0,
      ]
    );
  },

  // ==========================================
  // 5. Vehicle Incidents
  // ==========================================
  async saveVehicleIssue(issue: VehicleIssueReport): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_incidents (
        id, truck_id, driver_id, incident_type, description, severity, photo_uri, reported_at, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        issue.id,
        issue.truck_id,
        issue.driver_id,
        issue.incident_type,
        issue.description,
        issue.severity,
        issue.photo_uri || null,
        issue.reported_at,
        issue.synced ? 1 : 0,
      ]
    );
  },

  // ==========================================
  // 6. Sync Queue Status Synchronization
  // ==========================================
  async markShiftSynced(idOrDriverId: string): Promise<void> {
    const db = await getDatabase();
    const result = await db.runAsync(`UPDATE local_driver_shift SET synced = 1 WHERE id = ?;`, [idOrDriverId]);
    if (result.changes === 0) {
      await db.runAsync(
        `UPDATE local_driver_shift SET synced = 1 WHERE rowid IN (
          SELECT rowid FROM local_driver_shift WHERE driver_id = ? ORDER BY clock_in_time DESC, rowid DESC LIMIT 1
        );`,
        [idOrDriverId]
      );
    }
  },

  async markFuelLogSynced(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`UPDATE local_fuel_logs SET synced = 1 WHERE id = ?;`, [id]);
  },

  async markApprehensionSynced(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`UPDATE local_apprehensions SET synced = 1 WHERE id = ?;`, [id]);
  },

  async markVehicleIssueSynced(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`UPDATE local_incidents SET synced = 1 WHERE id = ?;`, [id]);
  },
};
