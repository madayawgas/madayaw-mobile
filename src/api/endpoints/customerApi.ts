import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import { Customer } from '@/types';
import { MOCK_CUSTOMERS } from '../mockData';

export const customerApi = {
  async fetchZoneCustomers(zoneId: string): Promise<Customer[]> {
    if (ENV.USE_MOCK) {
      await delay();
      return MOCK_CUSTOMERS;
    }

    const res = await apiClient<{ customers: Customer[] }>(`/sales/customers?zoneId=${zoneId}`, {
      method: 'GET',
    });
    return res.data.customers;
  },

  async registerCustomer(customer: Omit<Customer, 'id' | 'is_locally_created' | 'created_at'>): Promise<Customer> {
    if (ENV.USE_MOCK) {
      await delay();
      return {
        ...customer,
        id: `cust-mock-${Date.now()}`,
        is_locally_created: false,
        created_at: new Date().toISOString(),
      };
    }

    const res = await apiClient<{ customer: Customer }>('/sales/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
    return res.data.customer;
  },
};
