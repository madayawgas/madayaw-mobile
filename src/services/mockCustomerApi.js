import { ENV } from '../config';
import { customerRepository } from '../database';
import { customerApi } from '../api';
import { networkSentinel } from '../sync/networkSentinel';

const mockCustomersData = {
  "status": "success",
  "data": {
    "count": 5,
    "customers": [
      {
        "id": "1",
        "name": "Leshka Karenderia",
        "address": "Jerome, Agdao, Davao City",
        "contactNumber": "+(63) 999 9999 994",
        "customerType": "COMMERCIAL",
        "isActive": true,
        "createdAt": "2026-10-06T14:40:00.000Z"
      },
      {
        "id": "2",
        "name": "Precious Gasoline",
        "address": "Matina Aplaya, Talomo, Davao City",
        "contactNumber": "+(63) 999 9999 995",
        "customerType": "COMMERCIAL",
        "isActive": true,
        "createdAt": "2026-09-18T14:00:00.000Z"
      },
      {
        "id": "3",
        "name": "Berning Station",
        "address": "Corner San Pedro St, Davao City",
        "contactNumber": "+(63) 999 9999 9996",
        "customerType": "COMMERCIAL",
        "isActive": true,
        "createdAt": "2026-10-08T14:40:00.000Z"
      },
      {
        "id": "4",
        "name": "Sofia Gas Station",
        "address": "123 Mabini St., Poblacion, Davao City",
        "contactNumber": "+(63) 999 9999 997",
        "customerType": "RETAIL",
        "isActive": true,
        "createdAt": "2026-10-06T14:00:00.000Z"
      },
      {
        "id": "5",
        "name": "Jollabee Bahada",
        "address": "J.P. Laurel Ave, Bajada, Davao City",
        "contactNumber": "+(63) 999 9999 998",
        "customerType": "COMMERCIAL",
        "isActive": true,
        "createdAt": "2021-10-09T08:00:00.000Z"
      }
    ]
  }
};

export const fetchCustomers = async () => {
  if (ENV.USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockCustomersData);
      }, 200);
    });
  }

  // 1. In production, check remote if online
  if (networkSentinel.isOnline()) {
    try {
      const remoteData = await customerApi.fetchCustomers();
      const rawList = Array.isArray(remoteData)
        ? remoteData
        : (remoteData?.customers || remoteData?.items || []);
      if (Array.isArray(rawList) && rawList.length > 0) {
        await customerRepository.upsertCustomers(rawList);
      }
    } catch (e) {
      console.warn('[mockCustomerApi] Remote customer fetch failed, using local database:', e.message);
    }
  }

  // 2. Read from authoritative local SQLite database
  const localCustomers = await customerRepository.getAllCustomers();
  const normalized = (localCustomers || []).map((c) => ({
    id: c.id,
    name: c.name || c.business_name || c.store_name || 'Customer',
    business_name: c.business_name || c.name || '',
    address: c.address || c.delivery_address || '',
    delivery_address: c.delivery_address || c.address || '',
    contactNumber: c.contactNumber || c.contact_number || c.phone || '',
    contact_number: c.contact_number || c.phone || '',
    customerType: c.customerType || c.customer_type || 'RETAIL',
    customer_type: c.customer_type || 'RETAIL',
    canister_debt: c.canister_debt ?? c.current_debt ?? 0,
    isActive: true,
    createdAt: c.created_at || new Date().toISOString(),
  }));

  return {
    status: 'success',
    data: {
      count: normalized.length,
      customers: normalized,
    },
  };
};