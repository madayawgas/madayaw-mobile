import { getDatabase } from '../connection';
import { Customer } from '@/types';

export const customerRepository = {
  async getAllCustomers(searchQuery?: string): Promise<Customer[]> {
    const db = await getDatabase();
    if (!searchQuery || searchQuery.trim() === '') {
      const rows = await db.getAllAsync<any>(
        'SELECT * FROM local_customers ORDER BY business_name ASC;'
      );
      return rows.map((r) => ({
        ...r,
        is_locally_created: Boolean(r.is_locally_created),
      }));
    }

    const term = `%${searchQuery.trim().toLowerCase()}%`;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM local_customers
       WHERE LOWER(business_name) LIKE ?
          OR LOWER(contact_person) LIKE ?
          OR contact_number LIKE ?
       ORDER BY business_name ASC;`,
      [term, term, term]
    );
    return rows.map((r) => ({
      ...r,
      is_locally_created: Boolean(r.is_locally_created),
    }));
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM local_customers WHERE id = ?;',
      [id]
    );
    if (!row) return null;
    return {
      ...row,
      is_locally_created: Boolean(row.is_locally_created),
    };
  },

  async upsertCustomers(customers: Customer[]): Promise<void> {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async () => {
      for (const c of customers) {
        await db.runAsync(
          `INSERT INTO local_customers (
            id, business_name, contact_person, contact_number, delivery_address,
            customer_type, zone_id, canister_debt, is_locally_created, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            business_name = excluded.business_name,
            contact_person = excluded.contact_person,
            contact_number = excluded.contact_number,
            delivery_address = excluded.delivery_address,
            customer_type = excluded.customer_type,
            zone_id = excluded.zone_id,
            canister_debt = excluded.canister_debt;`,
          [
            c.id,
            c.business_name,
            c.contact_person,
            c.contact_number,
            c.delivery_address,
            c.customer_type,
            c.zone_id || null,
            c.canister_debt || 0,
            c.is_locally_created ? 1 : 0,
            c.created_at,
          ]
        );
      }
    });
  },

  async createOfflineCustomer(customer: Customer): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO local_customers (
        id, business_name, contact_person, contact_number, delivery_address,
        customer_type, zone_id, canister_debt, is_locally_created, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);`,
      [
        customer.id,
        customer.business_name,
        customer.contact_person,
        customer.contact_number,
        customer.delivery_address,
        customer.customer_type,
        customer.zone_id || null,
        customer.canister_debt || 0,
        customer.created_at,
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
