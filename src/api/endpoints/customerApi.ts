import { apiClient } from '../client';
import { Customer } from '@/types';

export const customerApi = {
  async fetchZoneCustomers(zoneId?: string): Promise<Customer[]> {
    const query = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
    const res = await apiClient<any>(`/sales/customers${query}`, {
      method: 'GET',
    });
    const rawList = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.customers) ? res.data.customers : []);
    return rawList;
  },

  async getCustomerById(id: string): Promise<any> {
    const res = await apiClient<any>(`/sales/customers/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    return res.data?.customer || res.data;
  },

  async registerCustomer(customer: any): Promise<Customer> {
    const payload = {
      name: customer.name || customer.business_name || customer.businessName || customer.contact_person || customer.contactPerson,
      businessName: customer.business_name || customer.businessName || null,
      contactPerson: customer.contact_person || customer.contactPerson || customer.name || 'Customer',
      contactNumber: customer.contact_number || customer.contactNumber || '',
      alternateContactNumber: customer.alternate_contact_number || customer.alternateContactNumber || null,
      deliveryAddress: customer.delivery_address || customer.deliveryAddress || customer.address || '',
      address: customer.delivery_address || customer.deliveryAddress || customer.address || '',
      customerType: customer.customer_type || customer.customerType || 'RETAIL',
      tin: customer.tin || null,
      zoneId: customer.zone_id || customer.zoneId || null,
      isActive: customer.isActive !== undefined ? customer.isActive : true,
    };

    const res = await apiClient<any>('/sales/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data?.customer || res.data;
  },

  async updateCustomer(id: string, customer: any): Promise<Customer> {
    const payload = {
      name: customer.name || customer.business_name || customer.businessName || customer.contact_person || customer.contactPerson,
      businessName: customer.business_name !== undefined ? customer.business_name : (customer.businessName !== undefined ? customer.businessName : null),
      contactPerson: customer.contact_person || customer.contactPerson || customer.name || 'Customer',
      contactNumber: customer.contact_number || customer.contactNumber || '',
      alternateContactNumber: customer.alternate_contact_number !== undefined ? customer.alternate_contact_number : (customer.alternateContactNumber !== undefined ? customer.alternateContactNumber : null),
      deliveryAddress: customer.delivery_address || customer.deliveryAddress || customer.address || '',
      address: customer.delivery_address || customer.deliveryAddress || customer.address || '',
      customerType: customer.customer_type || customer.customerType || 'RETAIL',
      tin: customer.tin !== undefined ? customer.tin : null,
      zoneId: customer.zone_id !== undefined ? customer.zone_id : (customer.zoneId !== undefined ? customer.zoneId : null),
    };

    const res = await apiClient<any>(`/sales/customers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.data?.customer || res.data;
  },
};
