import { apiClient, delay } from '../client';
import { ENV } from '@/config';
import { ProductCatalogItem } from '@/types';
import { MOCK_PRODUCTS } from '../mockData';

export const productApi = {
  async fetchProductCatalog(): Promise<ProductCatalogItem[]> {
    if (ENV.USE_MOCK) {
      await delay(150);
      return MOCK_PRODUCTS;
    }

    const res = await apiClient<any>('/inventory/products', {
      method: 'GET',
    });
    const rawList = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.products) ? res.data.products : []);
    return rawList;
  },
};
