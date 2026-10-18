import { ENV } from '../config';
import { productApi } from '../api';
import { inventoryRepository } from '../database';
import { networkSentinel } from '../sync/networkSentinel';

const mockProductsData = [
  {
    id: "e9b21f37-142c-4f76-96f3-a3d8b02e7b91",
    name: "Butane Canister 250g",
    category: "Canister",
    containerType: "CANISTER",
    netWeightKg: 0.25,
    price: 100.00,
    isActive: true,
    createdAt: "2026-08-28T12:20:00.000Z",
    updatedAt: "2026-08-28T12:20:00.000Z",
  },
  {
    id: "27d6365b-bfb0-4ca7-b286-63d1bcfa2520",
    name: "11kg LPG Cylinder",
    category: "LPG Cylinder",
    containerType: "CYLINDER",
    netWeightKg: 11.0,
    price: 1000.00,
    isActive: true,
    createdAt: "2026-08-28T12:20:00.000Z",
    updatedAt: "2026-08-28T12:20:00.000Z",
  },
  {
    id: "84fc2e10-c4a1-4328-98e3-509f6e6f1f44",
    name: "50kg LPG Cylinder",
    category: "LPG Cylinder",
    containerType: "CYLINDER",
    netWeightKg: 50.0,
    price: 4200.00,
    isActive: true,
    createdAt: "2026-08-28T12:20:00.000Z",
    updatedAt: "2026-08-28T12:20:00.000Z",
  },
];

export const fetchProducts = async () => {
  if (ENV.USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockProductsData), 150);
    });
  }

  // 1. In production, attempt remote product catalog if online
  if (networkSentinel.isOnline()) {
    try {
      const remote = await productApi.fetchProducts();
      const list = Array.isArray(remote) ? remote : (remote?.products || remote?.items || []);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((p) => ({
          id: p.id,
          name: p.name || p.sku,
          category: p.category || (p.containerType === 'CANISTER' ? 'Canister' : 'LPG Cylinder'),
          containerType: p.containerType || 'CYLINDER',
          netWeightKg: Number(p.netWeightKg || 0),
          price: Number(p.price || 0),
          isActive: p.isActive !== false,
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('[mockProductApi] Remote fetchProducts failed, falling back to local inventory:', e.message);
    }
  }

  // 2. Fallback to loaded truck inventory
  const localInventory = await inventoryRepository.getAllInventory();
  if (Array.isArray(localInventory) && localInventory.length > 0) {
    return localInventory.map((item) => ({
      id: item.product_id,
      name: item.product_name,
      category: item.sku?.toLowerCase().includes('canister') ? 'Canister' : 'LPG Cylinder',
      containerType: item.sku?.toLowerCase().includes('canister') ? 'CANISTER' : 'CYLINDER',
      netWeightKg: item.sku?.toLowerCase().includes('11kg') ? 11 : (item.sku?.toLowerCase().includes('50kg') ? 50 : 0.17),
      price: item.sku?.toLowerCase().includes('canister') ? 100 : (item.sku?.toLowerCase().includes('50kg') ? 4200 : 1000),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  // 3. Fallback to canonical DSD products
  return mockProductsData;
};