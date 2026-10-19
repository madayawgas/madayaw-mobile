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

    const res = await apiClient<any>('/trips/active-assignment', {
      method: 'GET',
    });
    const rawTrip = res.data?.trip !== undefined ? res.data.trip : res.data;
    const trip = (rawTrip && typeof rawTrip === 'object' && rawTrip.id) ? rawTrip : null;
    return { trip };
  },

  async fetchTripStock(tripId: string): Promise<TripStockItem[]> {
    if (ENV.USE_MOCK) {
      await delay();
      return MOCK_INITIAL_TRIP_STOCK;
    }

    const res = await apiClient<any>(`/inventory/trips/${tripId}/stock`, {
      method: 'GET',
    });
    const rawItems = res.data?.items || res.data?.stock || [];
    if (!Array.isArray(rawItems)) return [];

    return rawItems.map((item: any) => ({
      productId: item.productId || item.product_id,
      productName: item.productName || item.product_name || 'Gas Cylinder',
      sku: item.sku || (item.containerType === 'CANISTER' ? 'BUTANE_170G' : 'LPG_11KG'),
      condition: item.condition || 'FILLED',
      quantityUnits: Number(item.currentOnBoardFull ?? item.loadedFull ?? item.quantityUnits ?? item.quantity ?? 0),
    }));
  },
};
