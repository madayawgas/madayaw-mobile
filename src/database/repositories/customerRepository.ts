import { getDatabase } from '../connection';
import { Customer } from '@/types';

function mapCustomerRow(r: any): Customer {
  const businessName = r.business_name || r.name || '';
  const contactPerson = r.contact_person || r.name || 'Customer';
  const displayName = r.name || businessName || contactPerson || 'Customer';
  const address = r.delivery_address || r.address || '';
  const contactNumber = r.contact_number || r.contactNumber || '';
  const customerType = r.customer_type || r.customerType || 'COMMERCIAL';
  const zoneId = r.zone_id || r.zoneId || null;

  return {
    ...r,
    name: displayName,
    business_name: businessName,
    businessName: businessName,
    contact_person: contactPerson,
    contactPerson: contactPerson,
    contact_number: contactNumber,
    contactNumber: contactNumber,
    delivery_address: address,
    deliveryAddress: address,
    address: address,
    customer_type: customerType,
    customerType: customerType,
    zone_id: zoneId,
    zoneId: zoneId,
    canister_debt: Number(r.canister_debt || 0),
    canisterDebt: Number(r.canister_debt || 0),
    is_locally_created: Boolean(r.is_locally_created),
    created_at: r.created_at,
    createdAt: r.created_at,
  };
}

export const customerRepository = {
  async getAllCustomers(
    searchQuery?: string,
    zoneId?: string,
    sortOrder: 'ASC' | 'DESC' | 'RECENT' = 'ASC'
  ): Promise<Customer[]> {
    const db = await getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];

    if (zoneId && zoneId !== 'ALL') {
      conditions.push('zone_id = ?');
      params.push(zoneId);
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const term = `%${searchQuery.trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(COALESCE(business_name, '')) LIKE ?
          OR LOWER(COALESCE(contact_person, '')) LIKE ?
          OR LOWER(COALESCE(name, '')) LIKE ?
          OR contact_number LIKE ?
          OR LOWER(COALESCE(delivery_address, '')) LIKE ?)`
      );
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderByClause =
      sortOrder === 'RECENT'
        ? 'ORDER BY created_at DESC'
        : sortOrder === 'DESC'
        ? 'ORDER BY COALESCE(name, business_name, contact_person) DESC'
        : 'ORDER BY COALESCE(name, business_name, contact_person) ASC';

    const rows = await db.getAllAsync<any>(
      `SELECT * FROM local_customers ${whereClause} ${orderByClause};`,
      params
    );
    return rows.map(mapCustomerRow);
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM local_customers WHERE id = ?;',
      [id]
    );
    if (!row) return null;
    return mapCustomerRow(row);
  },

  async upsertCustomers(customers: Customer[]): Promise<void> {
    if (!customers || customers.length === 0) return;
    const db = await getDatabase();
    for (const c of customers) {
      const businessName = c.business_name || (c as any).businessName || c.name || '';
      const contactPerson = c.contact_person || (c as any).contactPerson || c.name || 'Customer';
      const contactNumber = c.contact_number || c.contactNumber || '';
      const deliveryAddress = c.delivery_address || (c as any).deliveryAddress || c.address || '';
      const customerType = c.customer_type || c.customerType || 'COMMERCIAL';
      const zoneId = c.zone_id || c.zoneId || null;
      const canisterDebt = c.canister_debt ?? c.canisterDebt ?? (c as any).total_net_canister_debt ?? (c as any).totalNetCanisterDebt ?? 0;
      const createdAt = c.created_at || c.createdAt || new Date().toISOString();
      const displayName = c.name || businessName || contactPerson;

      await db.runAsync(
        `INSERT INTO local_customers (
          id, business_name, contact_person, contact_number, delivery_address,
          customer_type, zone_id, canister_debt, is_locally_created, created_at,
          name, address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_name = excluded.business_name,
          contact_person = excluded.contact_person,
          contact_number = excluded.contact_number,
          delivery_address = excluded.delivery_address,
          customer_type = excluded.customer_type,
          zone_id = excluded.zone_id,
          canister_debt = excluded.canister_debt,
          name = excluded.name,
          address = excluded.address;`,
        [
          c.id,
          businessName,
          contactPerson,
          contactNumber,
          deliveryAddress,
          customerType,
          zoneId,
          canisterDebt,
          c.is_locally_created ? 1 : 0,
          createdAt,
          displayName,
          deliveryAddress,
        ]
      );
    }
  },

  async createOfflineCustomer(customer: Customer): Promise<void> {
    const db = await getDatabase();
    const businessName = customer.business_name || (customer as any).businessName || customer.name || '';
    const contactPerson = customer.contact_person || (customer as any).contactPerson || customer.name || 'Customer';
    const contactNumber = customer.contact_number || customer.contactNumber || '';
    const deliveryAddress = customer.delivery_address || (customer as any).deliveryAddress || customer.address || '';
    const customerType = customer.customer_type || customer.customerType || 'COMMERCIAL';
    const zoneId = customer.zone_id || customer.zoneId || null;
    const canisterDebt = customer.canister_debt ?? customer.canisterDebt ?? 0;
    const createdAt = customer.created_at || customer.createdAt || new Date().toISOString();
    const displayName = customer.name || businessName || contactPerson;

    await db.runAsync(
      `INSERT INTO local_customers (
        id, business_name, contact_person, contact_number, delivery_address,
        customer_type, zone_id, canister_debt, is_locally_created, created_at,
        name, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
      [
        customer.id,
        businessName,
        contactPerson,
        contactNumber,
        deliveryAddress,
        customerType,
        zoneId,
        canisterDebt,
        createdAt,
        displayName,
        deliveryAddress,
      ]
    );
  },

  async updateCustomerDebt(customerId: string, netDebtChange: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_customers
       SET canister_debt = canister_debt + ?
       WHERE id = ?;`,
      [netDebtChange, customerId]
    );
  },

  async setCustomerCanisterDebt(customerId: string, debt: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_customers
       SET canister_debt = ?
       WHERE id = ?;`,
      [debt, customerId]
    );
  },

  async getLocallyCreatedCustomers(): Promise<Customer[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM local_customers WHERE is_locally_created = 1 ORDER BY created_at ASC;'
    );
    return rows.map(mapCustomerRow);
  },

  async markBatchCustomersSynced(customerIds: string[]): Promise<void> {
    if (customerIds.length === 0) return;
    const db = await getDatabase();
    const placeholders = customerIds.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE local_customers
       SET is_locally_created = 0
       WHERE id IN (${placeholders});`,
      customerIds
    );
  },

  async getAvailableZones(): Promise<{ id: string; name: string; code?: string }[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ zone_id: string; zone_name: string | null; zone_code: string | null }>(
      `SELECT DISTINCT c.zone_id, z.name AS zone_name, z.code AS zone_code
       FROM local_customers c
       LEFT JOIN local_service_zones z ON c.zone_id = z.id
       WHERE c.zone_id IS NOT NULL AND c.zone_id != '';`
    );
    return rows.map((r) => ({
      id: r.zone_id,
      name: r.zone_name || r.zone_code || r.zone_id,
      code: r.zone_code || undefined,
    }));
  },

  async getCustomerCanisterBalances(
    customerId: string
  ): Promise<{ productId: string; productName: string; netBalance: number; pendingBalance: number }[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      product_id: string;
      product_name: string | null;
      net_balance: number;
      pending_balance: number;
    }>(
      `SELECT
         cl.product_id,
         COALESCE(
           (SELECT product_name FROM local_vehicle_inventory WHERE product_id = cl.product_id LIMIT 1),
           (SELECT product_name FROM local_sales_items WHERE product_id = cl.product_id LIMIT 1),
           CASE 
             WHEN cl.product_id LIKE '%canister%' THEN '170g Butane Canister'
             WHEN cl.product_id LIKE '%11kg%' THEN '11kg LPG Cylinder'
             WHEN cl.product_id LIKE '%50kg%' THEN '50kg LPG Cylinder'
             ELSE 'LPG / Butane Cylinder'
           END
         ) AS product_name,
         SUM(cl.net_balance_change) AS net_balance,
         SUM(CASE WHEN so.sync_status != 'SYNCED' THEN cl.net_balance_change ELSE 0 END) AS pending_balance
       FROM local_canister_ledger cl
       LEFT JOIN local_sales_orders so ON so.id = cl.transaction_id
       WHERE cl.customer_id = ?
       GROUP BY cl.product_id
       HAVING net_balance > 0 OR pending_balance > 0
       ORDER BY net_balance DESC;`,
      [customerId]
    );

    return rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name || 'Gas Product',
      netBalance: Number(r.net_balance || 0),
      pendingBalance: Number(r.pending_balance || 0),
    }));
  },
};
