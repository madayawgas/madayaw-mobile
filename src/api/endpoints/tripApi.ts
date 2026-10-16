import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import { ActiveAssignmentResponseData, TripStockItem } from '@/types';
import { MOCK_ACTIVE_TRIP, MOCK_INITIAL_TRIP_STOCK } from '../mockData';

export const tripApi = {
  async fetchActiveAssignment(): Promise<ActiveAssignmentResponseData> {
    if (ENV.USE_MOCK) {
      await delay();
      return MOCK_ACTIVE_TRIP;
    }

    const res = await apiClient<ActiveAssignmentResponseData>('/trips/active-assignment', {
      method: 'GET',
    });
    return res.data;
  },

  async fetchTripStock(tripId: string): Promise<TripStockItem[]> {
    if (ENV.USE_MOCK) {
      await delay();
      return MOCK_INITIAL_TRIP_STOCK;
    }

    const res = await apiClient<{ stock: TripStockItem[] }>(`/inventory/trips/${tripId}/stock`, {
      method: 'GET',
    });
    return res.data.stock;
  },
};
