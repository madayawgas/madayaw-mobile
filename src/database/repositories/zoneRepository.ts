import { getDatabase } from '../connection';
import { ServiceZone } from '@/types';

export const zoneRepository = {
  /**
   * Retrieves all active service zones sorted alphabetically by name.
   */
  async getAllZones(): Promise<ServiceZone[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM local_service_zones WHERE is_active = 1 ORDER BY name ASC;'
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code || '',
      name: r.name || r.code || 'Zone',
      description: r.description || null,
      is_active: Boolean(r.is_active),
      isActive: Boolean(r.is_active),
    }));
  },

  /**
   * Retrieves a single service zone by UUID.
   */
  async getZoneById(id: string): Promise<ServiceZone | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM local_service_zones WHERE id = ?;',
      [id]
    );
    if (!row) return null;
    return {
      id: row.id,
      code: row.code || '',
      name: row.name || row.code || 'Zone',
      description: row.description || null,
      is_active: Boolean(row.is_active),
      isActive: Boolean(row.is_active),
    };
  },

  /**
   * Upserts remote or local service zones into SQLite.
   */
  async upsertZones(zones: ServiceZone[]): Promise<void> {
    if (!zones || zones.length === 0) return;
    const db = await getDatabase();
    for (const z of zones) {
      await db.runAsync(
        `INSERT INTO local_service_zones (id, code, name, description, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code = excluded.code,
           name = excluded.name,
           description = excluded.description,
           is_active = excluded.is_active;`,
        [
          z.id,
          z.code || null,
          z.name || z.code || 'Zone',
          z.description || null,
          z.is_active ?? (z.isActive ?? true) ? 1 : 0,
        ]
      );
    }
  },
};
