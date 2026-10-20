import { apiClient } from '../client';
import { ProductCatalogItem } from '@/types';

export const productApi = {
  async fetchProductCatalog(): Promise<ProductCatalogItem[]> {
    const res = await apiClient<any>('/inventory/products', {
      method: 'GET',
    });
    const rawList = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.products) ? res.data.products : []);
    return rawList;
  },
};
