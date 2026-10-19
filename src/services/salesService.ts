import * as Crypto from 'expo-crypto';
import {
  salesRepository,
  inventoryRepository,
  tripRepository,
  customerRepository,
} from '@/database';
import {
  SalesOrder,
  SalesOrderItem,
  CanisterLedgerEntry,
  PaymentMethod,
} from '@/types';
import { networkSentinel } from '@/sync/networkSentinel';
import { syncWorker } from '@/sync/syncWorker';

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
}

export interface StockValidationResult {
  hasShortage: boolean;
  warnings: string[];
}

export const salesService = {
  /**
   * Permissive Selling Policy: Checks whether requested quantities exceed truck stock.
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
          `Selling ${item.quantitySold} of "${item.productName}", but truck shows only ${remaining} remaining on board.`
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
  async processSale(params: ProcessSaleParams): Promise<{ order: SalesOrder; receiptNumber: string }> {
    const { customerId, customerName, items, paymentMethod, paymentReference } = params;

    const activeTrip = await tripRepository.getActiveTrip();
    if (!activeTrip) {
      throw new Error('No active shift found. Please start your shift before recording sales.');
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

    // 3. Evaluate Canister Debt Math & Items
    let orderTotalAmount = 0;
    let netCustomerDebtDelta = 0;

    const salesItems: SalesOrderItem[] = [];
    const canisterEntries: CanisterLedgerEntry[] = [];
    const inventoryDeductions: { productId: string; quantitySold: number }[] = [];

    for (const item of items) {
      const lineSubtotal = item.quantitySold * item.unitPrice;
      orderTotalAmount += lineSubtotal;

      const itemId = Crypto.randomUUID();
      salesItems.push({
        id: itemId,
        sales_order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity_sold: item.quantitySold,
        empties_returned: item.emptiesReturned,
        empties_defective: item.emptiesDefective || 0,
        unit_price: item.unitPrice,
        subtotal: lineSubtotal,
      });

      // Canister Debt Math:
      // quantity_loaned = max(0, quantity_sold - empties_returned)
      // quantity_returned = max(0, empties_returned - quantity_sold)
      // net_balance_change = quantity_loaned - quantity_returned
      const qtyLoaned = Math.max(0, item.quantitySold - item.emptiesReturned);
      const qtyReturned = Math.max(0, item.emptiesReturned - item.quantitySold);
      const netCanisterChange = qtyLoaned - qtyReturned;
      netCustomerDebtDelta += netCanisterChange;

      if (item.quantitySold > 0 || item.emptiesReturned > 0) {
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

    // 4. Build Sales Order Object
    const salesOrder: SalesOrder = {
      id: orderId,
      transaction_no: transactionNo,
      trip_id: activeTrip.trip_id,
      customer_id: customerId,
      customer_name: customerName,
      receipt_number: receiptNumber,
      total_amount: orderTotalAmount,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
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

    return { order: salesOrder, receiptNumber };
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
    const activeTrip = await tripRepository.getActiveTrip();
    const customerId = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newCustomer = {
      id: customerId,
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
};
