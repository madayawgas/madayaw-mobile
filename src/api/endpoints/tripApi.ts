import { apiClient } from '../client';
import { ActiveAssignmentResponseData, TripStockItem } from '@/types';

export const tripApi = {
  async fetchActiveAssignment(): Promise<ActiveAssignmentResponseData> {
    const res = await apiClient<any>('/trips/active-assignment', {
      method: 'GET',
    });
    const rawTrip = res.data?.trip !== undefined ? res.data.trip : res.data;
    const trip = (rawTrip && typeof rawTrip === 'object' && rawTrip.id) ? rawTrip : null;
    return { trip };
  },

  async fetchTripStock(tripId: string): Promise<TripStockItem[]> {
    const res = await apiClient<any>(`/inventory/trips/${tripId}/stock`, {
      method: 'GET',
    });
    const rawItems = res.data?.items || res.data?.stock || [];
    if (!Array.isArray(rawItems)) return [];

    return rawItems.map((item: any) => {
      const loadedFull = Number(item.loadedFull ?? item.loaded_full ?? item.quantityUnits ?? item.quantity ?? 0);
      const currentOnBoard = Number(item.currentOnBoardFull ?? item.current_on_board_full ?? loadedFull);
      const defaultSku = item.containerType === 'CANISTER'
        ? 'BUTANE_170G'
        : item.netWeightKg === 50
        ? 'LPG_50KG'
        : 'LPG_11KG';

      return {
        productId: item.productId || item.product_id,
        productName: item.productName || item.product_name || 'Gas Cylinder',
        sku: item.sku || defaultSku,
        condition: item.condition || 'FILLED',
        quantityUnits: currentOnBoard,
        loadedFull,
        currentOnBoardFull: currentOnBoard,
      };
    });
  },
};
