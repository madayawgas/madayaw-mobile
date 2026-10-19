import { ENV } from '../config';
import { salesService } from './salesService';
import { salesRepository } from '../database';

// Mock order database array for mock mode
const mockOrdersDatabase = [];

/**
 * Saves a newly placed order.
 * In live mode, writes atomically to SQLite through salesService.processSale
 * and queues/syncs directly based on connectivity.
 * @param {Object} orderPayload - { customerId, customerName, items: [{ id, name, price, quantity }], totalAmount, paymentMethod, paymentReference }
 */
export const createOrder = async (orderPayload) => {
  if (ENV.USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newOrder = {
          orderId: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'PENDING',
          customerId: orderPayload.customerId,
          customerName: orderPayload.customerName,
          items: orderPayload.items,
          totalAmount: orderPayload.totalAmount,
          createdAt: new Date().toISOString(),
        };

        mockOrdersDatabase.push(newOrder);

        resolve({
          success: true,
          message: 'Order created successfully!',
          data: newOrder,
        });
      }, 300);
    });
  }

  const items = (orderPayload.items || []).map((i) => ({
    productId: i.id || i.productId,
    productName: i.name || i.productName || 'Gas Product',
    quantitySold: Number(i.quantity || i.quantitySold || 0),
    emptiesReturned: Number(i.emptiesReturned || 0),
    emptiesDefective: Number(i.emptiesDefective || 0),
    unitPrice: Number(i.price || i.unitPrice || 0),
  }));

  const result = await salesService.processSale({
    customerId: orderPayload.customerId,
    customerName: orderPayload.customerName,
    items,
    paymentMethod: orderPayload.paymentMethod || 'CASH',
    paymentReference: orderPayload.paymentReference,
  });

  return {
    success: true,
    message: 'Order created successfully!',
    data: {
      orderId: result.order.id,
      receiptNumber: result.receiptNumber,
      totalAmount: result.order.total_amount,
      customerName: orderPayload.customerName,
      status: result.order.sync_status || 'PENDING',
      createdAt: result.order.transacted_at,
    },
  };
};

export const fetchOrdersByCustomer = async (customerId) => {
  if (ENV.USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const customerOrders = mockOrdersDatabase.filter(
          (o) => o.customerId === customerId
        );
        resolve({ success: true, data: customerOrders });
      }, 200);
    });
  }

  const allOrders = await salesRepository.getRecentOrders(50);
  const filtered = allOrders.filter((o) => o.customer_id === customerId);
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
};