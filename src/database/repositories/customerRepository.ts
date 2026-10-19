import { getDatabase } from '../connection';
import { Customer } from '@/types';

function mapCustomerRow(r: any): Customer {
  const businessName = r.business_name || r.name || '';
  const contactPerson = r.contact_person || r.name || 'Customer';
  const displayName = r.name || businessName || contactPerson || 'Customer';
  const address = r.delivery_address || r.address || '';
  const contactNumber = r.contact_number || r.contactNumber || '';
  const customerType = r.customer_type || r.customerType || 'COMMERCIAL';

  return {
    ...r,
    name: displayName,
    business_name: businessName,
    contact_person: contactPerson,
    contact_number: contactNumber,
    contactNumber: contactNumber,
    delivery_address: address,
    address: address,
    customer_type: customerType,
    customerType: customerType,
    canister_debt: Number(r.canister_debt || 0),
    canisterDebt: Number(r.canister_debt || 0),
    is_locally_created: Boolean(r.is_locally_created),
    created_at: r.created_at,
    createdAt: r.created_at,
  };
}

export const customerRepository = {
  async getAllCustomers(searchQuery?: string): Promise<Customer[]> {
    const db = await getDatabase();
    if (!searchQuery || searchQuery.trim() === '') {
      const rows = await db.getAllAsync<any>(
        'SELECT * FROM local_customers ORDER BY COALESCE(name, business_name) ASC;'
      );
      return rows.map(mapCustomerRow);
    }

    const term = `%${searchQuery.trim().toLowerCase()}%`;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM local_customers
       WHERE LOWER(COALESCE(business_name, '')) LIKE ?
          OR LOWER(COALESCE(contact_person, '')) LIKE ?
          OR LOWER(COALESCE(name, '')) LIKE ?
          OR contact_number LIKE ?
       ORDER BY COALESCE(name, business_name) ASC;`,
      [term, term, term, term]
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
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const c of customers) {
        const businessName = c.business_name || (c as any).businessName || c.name || '';
        const contactPerson = c.contact_person || (c as any).contactPerson || c.name || 'Customer';
        const contactNumber = c.contact_number || c.contactNumber || '';
        const deliveryAddress = c.delivery_address || (c as any).deliveryAddress || c.address || '';
        const customerType = c.customer_type || c.customerType || 'COMMERCIAL';
        const zoneId = c.zone_id || c.zoneId || null;
        const canisterDebt = c.canister_debt ?? c.canisterDebt ?? c.total_net_canister_debt ?? 0;
        const createdAt = c.created_at || c.createdAt || new Date().toISOString();
        const displayName = c.name || businessName || contactPerson;

        await txn.runAsync(
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
    });
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
};
