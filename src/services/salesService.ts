import * as Crypto from 'expo-crypto';
import {
  salesRepository,
  inventoryRepository,
  tripRepository,
  customerRepository,
  syncQueueRepository,
  zoneRepository,
} from '@/database';
import { tripApi, customerApi, productApi, scheduleApi } from '@/api';
import {
  SalesOrder,
  SalesOrderItem,
  CanisterLedgerEntry,
  PaymentMethod,
  ActiveTrip,
  Customer,
  CustomerType,
  VehicleInventory,
  ServiceZone,
} from '@/types';
import { networkSentinel } from '@/sync/networkSentinel';
import { syncWorker } from '@/sync/syncWorker';
import { mediaService } from './mediaService';
import { authService } from './authService';

export interface SaleItemInput {
  productId: string;
  productName: string;
  quantitySold: number;
  emptiesReturned: number;
  emptiesDefective?: number;
  unitPrice: number;
}

export interface ProcessSaleParams {
  customerId: string;
  customerName?: string;
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentProofUri?: string;
  paymentProofKey?: string;
}

export interface StockValidationResult {
  hasShortage: boolean;
  warnings: string[];
}

export interface SalesDashboardData {
  trip: ActiveTrip | null;
  totalSales: number;
  recentOrders: SalesOrder[];
  inventory: VehicleInventory[];
  pendingSyncCount: number;
  isOnline: boolean;
}

export interface RegisterCustomerInput {
  businessName?: string;
  contactPerson: string;
  contactNumber: string;
  alternateContactNumber?: string;
  deliveryAddress: string;
  customerType: CustomerType;
  tin?: string;
  zoneId?: string;
}

let activeDashboardPromise: Promise<SalesDashboardData> | null = null;
let activeDashboardUserId: string | null = null;

export const salesService = {
    /**
   * Authoritatively checks and resolves the active trip assigned to the specified sales user:
   * - Validates trip details from backend (when online) or local SQLite cache (when offline).
   * - Strict Binding Invariant: Ensures that the user is bound to that trip (trip.sales_user_id === userId).
   * - If the trip belongs to another sales person / driver, or if no trip is assigned:
   *   automatically purges stale active trip and stale vehicle inventory in SQLite, returning null.
   * - If bound to an active trip (status === 'IN_PROGRESS'):
   *   saves the active trip and synchronizes the vehicle stock manifest to local_vehicle_inventory.
   */
  async resolveActiveTripForUser(userId?: string): Promise<ActiveTrip | null> {
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const session = await authService.getSession();
        effectiveUserId = session?.id;
      } catch {
        // ignore
      }
    }

    if (!effectiveUserId) {
      // Unauthenticated or unknown operator - purge any stale cabin trip/inventory
      await tripRepository.clearActiveTrip();
      await inventoryRepository.clearInventory();
      return null;
    }

    let activeTrip: ActiveTrip | null = null;

    if (networkSentinel.isOnline()) {
      try {
        const assignment = await tripApi.fetchActiveAssignment();
        if (assignment?.trip && assignment.trip.id) {
          const rawTrip = assignment.trip as any;
          const tripId = rawTrip.id;
          const tripSalesUserId = rawTrip.salesUserId || rawTrip.sales_user_id;
          const tripStatus = rawTrip.status || 'IN_PROGRESS';

          // Validate that the trip is actively assigned to this specific sales user
          if (tripSalesUserId && tripSalesUserId !== effectiveUserId) {
            console.warn(
              `[SalesService] Remote trip ${tripId} belongs to sales user "${tripSalesUserId}", not current operator "${effectiveUserId}". Purging cached assignment.`
            );
            await tripRepository.clearActiveTrip();
            await inventoryRepository.clearInventory();
            return null;
          }

          if (tripStatus !== 'IN_PROGRESS' && tripStatus !== 'PENDING') {
            console.log(`[SalesService] Remote trip ${tripId} status is ${tripStatus}. Purging cached assignment.`);
            await tripRepository.clearActiveTrip();
            await inventoryRepository.clearInventory();
            return null;
          }

          const tripNumber =
            rawTrip.tripNumber ||
            rawTrip.trip_number ||
            `TRIP-${tripId.substring(0, 8)}`;

          activeTrip = {
            trip_id: tripId,
            trip_number: tripNumber,
            vehicle_plate: rawTrip.truckPlateNumber || rawTrip.truck_plate_number || 'N/A',
            driver_name: rawTrip.driverName || rawTrip.driver_name || 'Driver',
            sales_user_id: tripSalesUserId || effectiveUserId,
            zone_id: rawTrip.zoneId || rawTrip.zone_id || 'DEFAULT',
            status: tripStatus,
            dispatched_at: rawTrip.departureTime || rawTrip.departure_time || new Date().toISOString(),
            truck_id: rawTrip.truckId || rawTrip.truck_id || null,
            truck_model: rawTrip.truckModel || rawTrip.truck_model || null,
            driver_id: rawTrip.driverId || rawTrip.driver_id || null,
            sales_user_name: rawTrip.salesUserName || rawTrip.sales_user_name || null,
            zone_name: rawTrip.zoneName || rawTrip.zone_name || null,
          };
          await tripRepository.saveActiveTrip(activeTrip);

          // Authoritatively fetch vehicle stock manifest and sync to local_vehicle_inventory
          try {
            const stockItems = await tripApi.fetchTripStock(activeTrip.trip_id);
            await inventoryRepository.syncTripInventory(activeTrip.trip_id, stockItems);
          } catch (stockErr) {
            console.warn('[SalesService] Could not fetch remote trip stock, keeping cached local inventory:', stockErr);
          }
        } else {
          // Server reports no active trip for this user today
          await tripRepository.clearActiveTrip();
          await inventoryRepository.clearInventory();
          activeTrip = null;
        }
      } catch (err) {
        console.warn('[SalesService] Could not fetch remote trip assignment, falling back to local SQLite:', err);
      }
    }

    if (!activeTrip) {
      const cachedTrip = await tripRepository.getActiveTrip();
      if (cachedTrip) {
        // Verify cached trip belongs to this sales user and is still active
        const belongsToUser = cachedTrip.sales_user_id === effectiveUserId;
        const isActive = cachedTrip.status === 'IN_PROGRESS';

        if (!belongsToUser || !isActive) {
          console.log(
            `[SalesService] Cached trip ${cachedTrip.trip_id} does not belong to operator "${effectiveUserId}" (sales_user_id="${cachedTrip.sales_user_id}", status="${cachedTrip.status}"). Purging.`
          );
          await tripRepository.clearActiveTrip();
          await inventoryRepository.clearInventory();
          activeTrip = null;
        } else {
          activeTrip = cachedTrip;
        }
      }
    }

    return activeTrip;
  },

  /**
   * Helper alias to resolve active delivery trip for user.
   */
  async getActiveTrip(userId?: string): Promise<ActiveTrip | null> {
    return this.resolveActiveTripForUser(userId);
  },

  /**
   * Retrieves operational dashboard data for the sales agent:
   * - Authoritative active trip synchronization scoped to user
   * - Shift total sales amount scoped strictly to active trip
   * - Latest sales orders scoped strictly to active trip
   * - Vehicle inventory counters (discrete integer units) scoped strictly to active trip
   * - Pending sync items scoped to user
   */
  async getDashboardData(userId?: string): Promise<SalesDashboardData> {
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const session = await authService.getSession();
        effectiveUserId = session?.id;
      } catch {
        // ignore
      }
    }

    if (activeDashboardPromise && activeDashboardUserId === effectiveUserId) {
      return activeDashboardPromise;
    }

    activeDashboardUserId = effectiveUserId || null;
    activeDashboardPromise = (async () => {
      try {
        const activeTrip = await this.resolveActiveTripForUser(effectiveUserId);
        const isTripActive = Boolean(activeTrip && activeTrip.status === 'IN_PROGRESS');

        const [totalSales, recentOrders, inventory, queueCount, offlineCustomers] = await Promise.all([
          isTripActive && activeTrip ? salesRepository.getTotalSalesAmount(activeTrip.trip_id) : Promise.resolve(0),
          isTripActive && activeTrip ? salesRepository.getRecentOrders(5, activeTrip.trip_id) : Promise.resolve([]),
          isTripActive ? inventoryRepository.getAllInventory() : Promise.resolve([]),
          syncQueueRepository.getPendingCount(effectiveUserId),
          customerRepository.getLocallyCreatedCustomers(),
        ]);

        return {
          trip: activeTrip,
          totalSales,
          recentOrders,
          inventory,
          pendingSyncCount: queueCount + offlineCustomers.length,
          isOnline: networkSentinel.isOnline(),
        };
      } finally {
        activeDashboardPromise = null;
        activeDashboardUserId = null;
      }
    })();

    return activeDashboardPromise;
  },
  /**
   * Permissive Selling Policy: Checks whether requested quantities exceed vehicle stock.
   * Warns the Sales Agent, but never blocks field transactions.
   */
  async validateStockSufficiency(items: SaleItemInput[]): Promise<StockValidationResult> {
    const warnings: string[] = [];
    const inventory = await inventoryRepository.getAllInventory();

    for (const item of items) {
      if (item.quantitySold <= 0) continue;
      const stock = inventory.find((inv) => inv.product_id === item.productId);
      const remaining = stock ? stock.quantity_remaining : 0;

      if (item.quantitySold > remaining) {
        warnings.push(
          `Selling ${item.quantitySold} of "${item.productName}", but vehicle shows only ${remaining} remaining on board.`
        );
      }
    }

    return {
      hasShortage: warnings.length > 0,
      warnings,
    };
  },

  /**
   * Executes atomic sale or zero-sale canister declaration stop.
   * Single local SQLite transaction guaranteeing zero partial writes.
   */
  async processSale(params: ProcessSaleParams): Promise<{ order: SalesOrder; receiptNumber: string; newCustomerDebt: number }> {
    const { customerId, customerName, items, paymentMethod, paymentReference, paymentProofUri } = params;

    const session = await authService.getSession();
    const activeTrip = await this.resolveActiveTripForUser(session?.id);
    if (!activeTrip || activeTrip.status !== 'IN_PROGRESS') {
      throw new Error('No active delivery trip assigned to you. You cannot make a sale without an active delivery trip.');
    }

    // Process GCash payment receipt evidence if provided
    let persistentProofUri = paymentProofUri || null;
    let paymentProofKey = params.paymentProofKey || null;

    if (paymentMethod === 'GCASH' && paymentProofUri) {
      try {
        const cached = await mediaService.processAndCacheImage(paymentProofUri, 'gcash_receipt');
        persistentProofUri = cached.localUri;
      } catch (err: any) {
        console.warn('[SalesService] Could not cache GCash payment proof:', err?.message || err);
      }

      // If online and persistent image exists, attempt eager media upload to /api/media/upload
      if (networkSentinel.isOnline() && persistentProofUri && !paymentProofKey) {
        try {
          const uploadRes = await mediaService.uploadMedia(persistentProofUri, 'sales/payments');
          paymentProofKey = uploadRes.storageKey;
        } catch (upErr: any) {
          console.warn('[SalesService] Eager GCash proof upload deferred to sync queue:', upErr?.message || upErr);
        }
      }
    }

    const totalSold = items.reduce((sum, i) => sum + i.quantitySold, 0);
    const totalEmpties = items.reduce((sum, i) => sum + i.emptiesReturned, 0);
    const isZeroSale = totalSold === 0 && totalEmpties > 0;

    // 1. Generate client UUIDs
    const orderId = Crypto.randomUUID();
    const transactionNo = `TX-${activeTrip.trip_number.replace(/^TRIP-/, '')}-${Date.now().toString().slice(-6)}`;
    const transactedAt = new Date().toISOString();

    // 2. Control Receipt Number (INV-... or CD-...)
    const receiptNumber = await salesRepository.getNextControlNumber(
      activeTrip.trip_id,
      activeTrip.trip_number,
      isZeroSale
    );

    // 3. Evaluate Canister Debt Ledger & Line Items
    // Append-only canister debt math:
    // For each product SKU:
    //   quantity_loaned = max(0, quantity_sold - empties_returned)
    //   quantity_returned = max(0, empties_returned - quantity_sold)
    //   net_balance_change = quantity_loaned - quantity_returned
    // new_customer_debt = max(0, current_customer_debt + sum(net_balance_change))
    const customer = await customerRepository.getCustomerById(customerId);
    const currentCustomerDebt = Math.max(0, customer?.canister_debt ?? customer?.canisterDebt ?? 0);

    let orderTotalAmount = 0;
    let transactionNetCanisterChange = 0;

    const salesItems: SalesOrderItem[] = [];
    const canisterEntries: CanisterLedgerEntry[] = [];
    const inventoryDeductions: { productId: string; quantitySold: number }[] = [];

    for (const item of items) {
      const lineSubtotal = item.quantitySold * item.unitPrice;
      orderTotalAmount += lineSubtotal;

      const empties = Math.max(0, item.emptiesReturned || 0);
      const qtyLoaned = Math.max(0, item.quantitySold - empties);
      const qtyReturned = Math.max(0, empties - item.quantitySold);
      const netCanisterChange = qtyLoaned - qtyReturned;

      transactionNetCanisterChange += netCanisterChange;

      const itemId = Crypto.randomUUID();
      salesItems.push({
        id: itemId,
        sales_order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity_sold: item.quantitySold,
        empties_returned: empties,
        empties_defective: item.emptiesDefective || 0,
        unit_price: item.unitPrice,
        subtotal: lineSubtotal,
      });

      if (item.quantitySold > 0 || empties > 0) {
        canisterEntries.push({
          id: Crypto.randomUUID(),
          customer_id: customerId,
          product_id: item.productId,
          trip_id: activeTrip.trip_id,
          transaction_id: orderId,
          quantity_loaned: qtyLoaned,
          quantity_returned: qtyReturned,
          net_balance_change: netCanisterChange,
          transacted_at: transactedAt,
        });
      }

      if (item.quantitySold > 0) {
        inventoryDeductions.push({
          productId: item.productId,
          quantitySold: item.quantitySold,
        });
      }
    }

    const newCustomerDebt = Math.max(0, currentCustomerDebt + transactionNetCanisterChange);
    const netCustomerDebtDelta = newCustomerDebt - currentCustomerDebt;

    // 4. Build Sales Order Object
    const effectivePaymentRef = paymentReference || undefined;
    const salesOrder: SalesOrder = {
      id: orderId,
      transaction_no: transactionNo,
      trip_id: activeTrip.trip_id,
      customer_id: customerId,
      customer_name: customerName,
      receipt_number: receiptNumber,
      total_amount: orderTotalAmount,
      payment_method: paymentMethod,
      payment_reference: effectivePaymentRef,
      transacted_at: transactedAt,
      synced_at: null,
      sync_status: 'PENDING',
    };

    // 5. Build Sync Payload (flattened with transaction header at root for backend sync.service.js)
    const syncPayload = {
      id: orderId,
      transactionNo,
      tripId: activeTrip.trip_id,
      customerId,
      recordedBy: activeTrip.sales_user_id,
      status: 'COMPLETED',
      transactedAt,
      // Retain nested transaction object for backward/forward contract compatibility
      transaction: {
        id: orderId,
        transactionNo,
        tripId: activeTrip.trip_id,
        customerId,
        recordedBy: activeTrip.sales_user_id,
        status: 'COMPLETED',
        transactedAt,
      },
      invoice: {
        id: Crypto.randomUUID(),
        transactionId: orderId,
        invoiceNumber: !isZeroSale ? receiptNumber : null,
        declarationNumber: isZeroSale ? receiptNumber : null,
        totalAmount: orderTotalAmount,
        paymentMethod,
        paymentStatus: 'PAID_UNVERIFIED',
        paymentReferenceNumber: paymentReference || null,
        paymentProofKey: paymentProofKey || null,
        paymentProofUri: persistentProofUri || null,
        transactedAt,
      },
      items: salesItems.map((si) => ({
        id: si.id,
        transactionId: orderId,
        productId: si.product_id,
        quantitySold: si.quantity_sold,
        emptiesReturned: si.empties_returned,
        emptiesDefective: si.empties_defective,
        unitPriceAtSale: si.unit_price,
        subtotalAmount: si.subtotal,
      })),
      canisterLedger: canisterEntries.map((ce) => ({
        id: ce.id,
        customerId: ce.customer_id,
        productId: ce.product_id,
        tripId: ce.trip_id,
        transactionId: ce.transaction_id,
        quantityLoaned: ce.quantity_loaned,
        quantityReturned: ce.quantity_returned,
        netBalanceChange: ce.net_balance_change,
        transactedAt: ce.transacted_at,
      })),
    };

    // 6. Execute Atomic Transaction in SQLite
    await salesRepository.createAtomicSale({
      order: salesOrder,
      items: salesItems,
      canisterEntries,
      inventoryDeductions,
      customerDebtChange: netCustomerDebtDelta,
      newCustomerDebt: newCustomerDebt,
      syncQueueItem: {
        id: orderId, // Use order ID for queue item to enforce 1:1 sync tracking
        user_id: activeTrip.sales_user_id || 'sales-user',
        operation_type: isZeroSale ? 'ZERO_SALE_DECLARATION' : 'CREATE_ORDER',
        endpoint: '/sales/sync-batch',
        payload: JSON.stringify(syncPayload),
      },
    });

    // 7. If online, initiate background sync immediately
    if (networkSentinel.isOnline()) {
      syncWorker.runSyncCycle().catch((err) => {
        console.warn('[SalesService] Immediate background sync cycle skipped:', err?.message || err);
      });
    }

    return { order: salesOrder, receiptNumber, newCustomerDebt };
  },

  /**
   * Registers a customer offline from the truck cabin.
   */
  async registerOfflineCustomer(customerData: {
    businessName: string;
    contactPerson: string;
    contactNumber: string;
    deliveryAddress: string;
    customerType: 'COMMERCIAL' | 'RETAIL' | 'WHOLESALE';
  }) {
    const activeTrip = await this.resolveActiveTripForUser();
    const customerId = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newCustomer = {
      id: customerId,
      name: customerData.businessName || customerData.contactPerson,
      business_name: customerData.businessName,
      contact_person: customerData.contactPerson,
      contact_number: customerData.contactNumber,
      delivery_address: customerData.deliveryAddress,
      customer_type: customerData.customerType,
      zone_id: activeTrip?.zone_id,
      canister_debt: 0,
      is_locally_created: true,
      created_at: now,
    };

    await customerRepository.createOfflineCustomer(newCustomer);

    return newCustomer;
  },

  /**
   * Registers a customer following the dual direct-or-queue offline-first pattern:
   * - When online: registers directly via customerApi.registerCustomer and stores in SQLite.
   * - When offline or network error: creates in SQLite with is_locally_created = 1.
   */
  async registerCustomer(customerData: RegisterCustomerInput): Promise<Customer> {
    const activeTrip = await this.resolveActiveTripForUser();
    const effectiveZoneId = customerData.zoneId || activeTrip?.zone_id || null;

    // Standardize Philippine phone number to E.164 (+63...)
    const cleanNumber = (num?: string) => {
      if (!num) return '';
      const digits = num.replace(/\D/g, '');
      if (digits.startsWith('63') && digits.length >= 12) return `+${digits}`;
      if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
      if (digits.length === 10) return `+63${digits}`;
      return `+63${digits}`;
    };

    const formattedContact = cleanNumber(customerData.contactNumber);
    const formattedAltContact = customerData.alternateContactNumber
      ? cleanNumber(customerData.alternateContactNumber)
      : null;

    const customerPayload = {
      name: customerData.businessName || customerData.contactPerson,
      businessName: customerData.businessName || null,
      contactPerson: customerData.contactPerson,
      contactNumber: formattedContact,
      alternateContactNumber: formattedAltContact,
      deliveryAddress: customerData.deliveryAddress,
      customerType: customerData.customerType || 'RETAIL',
      tin: customerData.tin || null,
      zoneId: effectiveZoneId,
    };

    // 1. Try online direct registration if networkSentinel indicates online
    if (networkSentinel.isOnline()) {
      try {
        const createdRemote = await customerApi.registerCustomer(customerPayload);
        if (createdRemote && createdRemote.id) {
          const syncedCustomer: Customer = {
            id: createdRemote.id,
            name: createdRemote.name || customerPayload.name,
            business_name: createdRemote.business_name || (createdRemote as any).businessName || customerPayload.businessName || '',
            contact_person: createdRemote.contact_person || (createdRemote as any).contactPerson || customerPayload.contactPerson,
            contact_number: createdRemote.contact_number || (createdRemote as any).contactNumber || customerPayload.contactNumber,
            delivery_address: createdRemote.delivery_address || (createdRemote as any).deliveryAddress || customerPayload.deliveryAddress,
            customer_type: createdRemote.customer_type || (createdRemote as any).customerType || customerPayload.customerType,
            zone_id: createdRemote.zone_id || (createdRemote as any).zoneId || effectiveZoneId || undefined,
            canister_debt: createdRemote.canister_debt ?? 0,
            is_locally_created: false,
            created_at: createdRemote.created_at || (createdRemote as any).createdAt || new Date().toISOString(),
          };
          await customerRepository.upsertCustomers([syncedCustomer]);
          return syncedCustomer;
        }
      } catch (err: any) {
        // If it's a 400 validation error or 409 conflict, rethrow so UI can notify user
        const status = err?.status || err?.statusCode;
        const msg = err?.message || '';
        if (status === 400 || status === 409 || msg.includes('already exists') || msg.includes('required') || msg.includes('Invalid')) {
          throw err;
        }
        console.warn('[SalesService] Direct customer registration failed, falling back to local SQLite:', err);
      }
    }

    // 2. Offline Fallback: store locally with is_locally_created = 1
    const customerId = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newCustomer: Customer = {
      id: customerId,
      name: customerPayload.name,
      business_name: customerPayload.businessName || '',
      contact_person: customerPayload.contactPerson,
      contact_number: customerPayload.contactNumber,
      delivery_address: customerPayload.deliveryAddress,
      customer_type: customerPayload.customerType,
      zone_id: effectiveZoneId || undefined,
      canister_debt: 0,
      is_locally_created: true,
      created_at: now,
    };

    await customerRepository.createOfflineCustomer(newCustomer);
    return newCustomer;
  },

  /**
   * Updates an existing customer profile:
   * - When online: updates directly via customerApi.updateCustomer and stores in SQLite.
   * - When offline or network error: updates in local SQLite immediately.
   */
  async updateCustomer(id: string, customerData: RegisterCustomerInput): Promise<Customer> {
    const existing = await customerRepository.getCustomerById(id);
    const activeTrip = await tripRepository.getActiveTrip();
    const effectiveZoneId =
      customerData.zoneId !== undefined
        ? customerData.zoneId
        : (existing?.zone_id || activeTrip?.zone_id || null);

    const cleanNumber = (num?: string) => {
      if (!num) return '';
      const digits = num.replace(/\D/g, '');
      if (digits.startsWith('63') && digits.length >= 12) return `+${digits}`;
      if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
      if (digits.length === 10) return `+63${digits}`;
      return `+63${digits}`;
    };

    const formattedContact = cleanNumber(customerData.contactNumber);
    const formattedAltContact = customerData.alternateContactNumber
      ? cleanNumber(customerData.alternateContactNumber)
      : null;

    const customerPayload = {
      name: customerData.businessName || customerData.contactPerson,
      businessName: customerData.businessName || null,
      contactPerson: customerData.contactPerson,
      contactNumber: formattedContact,
      alternateContactNumber: formattedAltContact,
      deliveryAddress: customerData.deliveryAddress,
      customerType: customerData.customerType || 'RETAIL',
      tin: customerData.tin || null,
      zoneId: effectiveZoneId,
    };

    // 1. Try online direct update
    if (networkSentinel.isOnline()) {
      try {
        const updatedRemote = await customerApi.updateCustomer(id, customerPayload);
        if (updatedRemote && updatedRemote.id) {
          const syncedCustomer: Customer = {
            id: updatedRemote.id,
            name: updatedRemote.name || customerPayload.name,
            business_name: updatedRemote.business_name || (updatedRemote as any).businessName || customerPayload.businessName || '',
            contact_person: updatedRemote.contact_person || (updatedRemote as any).contactPerson || customerPayload.contactPerson,
            contact_number: updatedRemote.contact_number || (updatedRemote as any).contactNumber || customerPayload.contactNumber,
            delivery_address: updatedRemote.delivery_address || (updatedRemote as any).deliveryAddress || customerPayload.deliveryAddress,
            customer_type: updatedRemote.customer_type || (updatedRemote as any).customerType || customerPayload.customerType,
            zone_id: updatedRemote.zone_id || (updatedRemote as any).zoneId || effectiveZoneId || undefined,
            canister_debt: updatedRemote.canister_debt ?? existing?.canister_debt ?? 0,
            is_locally_created: existing?.is_locally_created || false,
            created_at: updatedRemote.created_at || (updatedRemote as any).createdAt || existing?.created_at || new Date().toISOString(),
          };
          await customerRepository.upsertCustomers([syncedCustomer]);
          return syncedCustomer;
        }
      } catch (err: any) {
        const status = err?.status || err?.statusCode;
        const msg = err?.message || '';
        if (status === 400 || status === 409 || msg.includes('already exists') || msg.includes('required') || msg.includes('Invalid')) {
          throw err;
        }
        console.warn('[SalesService] Direct customer update failed, falling back to local SQLite:', err);
      }
    }

    // 2. Offline Fallback: update local SQLite record
    const updatedLocal: Customer = {
      id,
      name: customerPayload.name,
      business_name: customerPayload.businessName || '',
      contact_person: customerPayload.contactPerson,
      contact_number: customerPayload.contactNumber,
      delivery_address: customerPayload.deliveryAddress,
      customer_type: customerPayload.customerType,
      zone_id: effectiveZoneId || undefined,
      canister_debt: existing?.canister_debt ?? 0,
      is_locally_created: existing?.is_locally_created || false,
      created_at: existing?.created_at || new Date().toISOString(),
    };

    await customerRepository.upsertCustomers([updatedLocal]);
    return updatedLocal;
  },

  /**
   * Retrieves customers with optional zone, search, and sorting filters.
   * Pulls fresh zone customers if online, and queries authoritative local SQLite.
   */
  async getCustomers(
    zoneId?: string,
    searchQuery?: string,
    sortOrder: 'ASC' | 'DESC' | 'RECENT' = 'ASC'
  ): Promise<{ customers: Customer[]; count: number }> {
    // 1. Sync remote if online and reachable
    if (networkSentinel.isOnline()) {
      try {
        const targetZone = zoneId && zoneId !== 'ALL' ? zoneId : undefined;
        const remoteData = await customerApi.fetchZoneCustomers(targetZone);
        const rawList = Array.isArray(remoteData)
          ? remoteData
          : (Array.isArray((remoteData as any)?.customers)
            ? (remoteData as any).customers
            : []);
        if (rawList.length > 0) {
          await customerRepository.upsertCustomers(rawList);
        }
      } catch {
        // Silent fallback to local database
      }
    }

    // 2. Read from authoritative local SQLite database
    const localCustomers = await customerRepository.getAllCustomers(searchQuery, zoneId, sortOrder);
    return {
      customers: localCustomers,
      count: localCustomers.length,
    };
  },

  /**
   * Product catalog fetcher for sales and inventory selection.
   * Strictly scopes returned products to what is loaded on the vehicle (local_vehicle_inventory).
   * Enriches with authoritative remote catalog metadata (prices, weights) when online.
   */
  async getProductCatalog(): Promise<any[]> {
    const session = await authService.getSession();
    const activeTrip = await this.resolveActiveTripForUser(session?.id);
    if (!activeTrip || activeTrip.status !== 'IN_PROGRESS') {
      return [];
    }

    const localInventory = await inventoryRepository.getAllInventory();
    const loadedMap = new Map<string, VehicleInventory>();
    (localInventory || []).forEach((inv) => {
      if (inv && inv.product_id) {
        loadedMap.set(inv.product_id, inv);
      }
    });

    if (networkSentinel.isOnline()) {
      try {
        const remote = await productApi.fetchProductCatalog();
        const list = Array.isArray(remote) ? remote : ((remote as any)?.products || (remote as any)?.items || []);
        if (Array.isArray(list) && list.length > 0) {
          // Strictly filter remote catalog to products loaded on the vehicle
          const filteredRemote = loadedMap.size > 0
            ? list.filter((p) =>
                loadedMap.has(p.id) ||
                Array.from(loadedMap.values()).some(
                  (inv) => inv.sku === p.sku || inv.product_name.toLowerCase() === (p.name || '').toLowerCase()
                )
              )
            : list;

          return filteredRemote.map((p) => {
            const matchedInv =
              loadedMap.get(p.id) ||
              Array.from(loadedMap.values()).find(
                (inv) => inv.sku === p.sku || inv.product_name.toLowerCase() === (p.name || '').toLowerCase()
              );
            const isCanister =
              p.containerType === 'CANISTER' ||
              p.name?.toLowerCase().includes('canister') ||
              p.sku?.toLowerCase().includes('canister');
            const is50kg =
              p.name?.toLowerCase().includes('50kg') ||
              p.sku?.toLowerCase().includes('50kg') ||
              Number(p.netWeightKg) === 50;
            const defaultPrice = isCanister ? 100 : (is50kg ? 4200 : 1000);
            const defaultNetWeight = isCanister ? 0.17 : (is50kg ? 50 : 11);

            return {
              id: p.id,
              name: p.name || p.sku,
              category: p.category || (isCanister ? 'Canister' : 'LPG Cylinder'),
              containerType: p.containerType || (isCanister ? 'CANISTER' : 'CYLINDER'),
              netWeightKg: Number(p.netWeightKg || defaultNetWeight),
              price: Number(p.price || defaultPrice),
              quantityRemaining: matchedInv ? matchedInv.quantity_remaining : 0,
              quantityLoaded: matchedInv ? matchedInv.quantity_loaded : 0,
              quantitySold: matchedInv ? matchedInv.quantity_sold : 0,
              isActive: p.isActive !== false,
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.updatedAt || new Date().toISOString(),
            };
          });
        }
      } catch (err) {
        console.warn('[SalesService] Remote catalog fetch failed, falling back to local vehicle inventory:', err);
      }
    }

    // Offline or fallback to loaded vehicle inventory
    if (Array.isArray(localInventory) && localInventory.length > 0) {
      return localInventory.map((item) => ({
        id: item.product_id,
        name: item.product_name,
        category: item.sku?.toLowerCase().includes('canister') ? 'Canister' : 'LPG Cylinder',
        containerType: item.sku?.toLowerCase().includes('canister') ? 'CANISTER' : 'CYLINDER',
        netWeightKg: item.sku?.toLowerCase().includes('11kg') ? 11 : (item.sku?.toLowerCase().includes('50kg') ? 50 : 0.17),
        price: item.sku?.toLowerCase().includes('canister') ? 100 : (item.sku?.toLowerCase().includes('50kg') ? 4200 : 1000),
        quantityRemaining: item.quantity_remaining,
        quantityLoaded: item.quantity_loaded,
        quantitySold: item.quantity_sold,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    }

    return [];
  },

  /**
   * Saves a newly placed order atomically to SQLite through salesService.processSale
   * and queues or syncs directly based on connectivity.
   */
  async createOrder(orderPayload: any): Promise<any> {
    const items: SaleItemInput[] = (orderPayload.items || []).map((i: any) => ({
      productId: i.id || i.productId,
      productName: i.name || i.productName || 'Gas Product',
      quantitySold: Number(i.quantity || i.quantitySold || 0),
      emptiesReturned: Number(i.emptiesReturned || 0),
      emptiesDefective: Number(i.emptiesDefective || 0),
      unitPrice: Number(i.price || i.unitPrice || 0),
    }));

    const result = await this.processSale({
      customerId: orderPayload.customerId,
      customerName: orderPayload.customerName,
      items,
      paymentMethod: orderPayload.paymentMethod || 'CASH',
      paymentReference: orderPayload.paymentReference,
      paymentProofUri: orderPayload.paymentProofUri,
    });

    return {
      success: true,
      message: 'Order created successfully!',
      data: {
        orderId: result.order.id,
        transactionNo: result.order.transaction_no,
        receiptNumber: result.receiptNumber,
        totalAmount: result.order.total_amount,
        customerName: orderPayload.customerName,
        status: result.order.sync_status || 'PENDING',
        createdAt: result.order.transacted_at,
        order: result.order,
        newCustomerDebt: result.newCustomerDebt,
      },
    };
  },

  /**
   * Fetches orders placed by a specific customer.
   */
  async getOrdersByCustomer(customerId: string): Promise<any> {
    const filtered = await salesRepository.getOrdersByCustomerId(customerId);
    return {
      success: true,
      data: filtered.map((o) => ({
        orderId: o.id,
        receiptNumber: o.receipt_number,
        customerId: o.customer_id,
        customerName: o.customer_name,
        totalAmount: o.total_amount,
        paymentMethod: o.payment_method,
        status: o.sync_status,
        createdAt: o.transacted_at,
      })),
    };
  },

  /**
   * Synchronizes delivery service zones from backend and local cache.
   */
  async syncZones(): Promise<ServiceZone[]> {
    if (networkSentinel.isOnline()) {
      try {
        const remoteZones = await scheduleApi.fetchZones();
        if (remoteZones.length > 0) {
          await zoneRepository.upsertZones(remoteZones);
        }
      } catch {
        // Fallback to local service zones
      }
    }
    return zoneRepository.getAllZones();
  },
};
