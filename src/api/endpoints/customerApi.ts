import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import { Customer } from '@/types';
import { MOCK_CUSTOMERS } from '../mockData';

export const customerApi = {
  async fetchZoneCustomers(zoneId?: string): Promise<Customer[]> {
    if (ENV.USE_MOCK) {
      await delay();
      return MOCK_CUSTOMERS;
    }

    const query = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
    const res = await apiClient<any>(`/sales/customers${query}`, {
      method: 'GET',
    });
    const rawList = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.customers) ? res.data.customers : []);
    return rawList;
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

    const payload = {
      name: customer.name || customer.business_name || customer.contact_person,
      businessName: customer.business_name || null,
      contactPerson: customer.contact_person || customer.name || 'Customer',
      contactNumber: customer.contact_number || (customer as any).contactNumber || '',
      deliveryAddress: customer.delivery_address || (customer as any).deliveryAddress || customer.address || '',
      address: customer.delivery_address || (customer as any).deliveryAddress || customer.address || '',
      customerType: customer.customer_type || (customer as any).customerType || 'COMMERCIAL',
      zoneId: customer.zone_id || (customer as any).zoneId || null,
    };

    const res = await apiClient<any>('/sales/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data?.customer || res.data;
  },
};
