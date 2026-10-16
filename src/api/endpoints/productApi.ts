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

    const res = await apiClient<{ products: ProductCatalogItem[] }>('/inventory/products', {
      method: 'GET',
    });
    return res.data.products;
  },
};
