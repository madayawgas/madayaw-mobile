import { ProductCatalogItem } from '@/types';

/**
 * Canonical 3-SKU Product Catalog for MadayawGas DSD Mobile Cabin.
 * Discrete integer quantities only. Crates of 24 units for Butane 170g are a UI abstraction.
 */
export const MOCK_PRODUCTS: ProductCatalogItem[] = [
  {
    id: 'prod-butane-170g-001',
    sku: 'BUTANE_170G',
    name: '170g Butane Canister',
    category: 'Canister',
    containerType: 'CANISTER',
    netWeightKg: 0.17,
    price: 95.0,
    unitsPerCrate: 24, // 1 crate = 24 integer units
    isActive: true,
  },
  {
    id: 'prod-lpg-11kg-002',
    sku: 'LPG_11KG',
    name: '11kg LPG Cylinder',
    category: 'LPG Cylinder',
    containerType: 'CYLINDER',
    netWeightKg: 11.0,
    price: 980.0,
    isActive: true,
  },
  {
    id: 'prod-lpg-50kg-003',
    sku: 'LPG_50KG',
    name: '50kg LPG Cylinder',
    category: 'LPG Cylinder',
    containerType: 'CYLINDER',
    netWeightKg: 50.0,
    price: 4200.0,
    isActive: true,
  },
];
