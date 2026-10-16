import { SalesOrder, SalesOrderItem, Customer, ActiveTrip } from '@/types';

export interface ThermalReceiptData {
  order: SalesOrder;
  items: SalesOrderItem[];
  customer?: Customer | null;
  trip?: ActiveTrip | null;
}

export const printService = {
  /**
   * Formats a simulated 58mm/80mm thermal receipt text slip.
   */
  generateReceiptText(data: ThermalReceiptData): string {
    const { order, items, customer, trip } = data;
    const isZeroSale = order.receipt_number.startsWith('CD-');
    const title = isZeroSale ? 'CANISTER DECLARATION' : 'SALES INVOICE';

    const line = '--------------------------------';
    const doubleLine = '================================';

    const dateFormatted = new Date(order.transacted_at).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
    });

    let receipt = '';
    receipt += '     MADAYAW GAS CORPORATION    \n';
    receipt += '   Central Plant, Bunawan Yard  \n';
    receipt += '     Davao City, Philippines    \n';
    receipt += '    TIN: 009-876-543-00000-VAT  \n';
    receipt += `${doubleLine}\n`;
    receipt += `        ${title}        \n`;
    receipt += `${doubleLine}\n`;
    receipt += `Doc No. : ${order.receipt_number}\n`;
    receipt += `Ref No. : ${order.transaction_no}\n`;
    receipt += `Date    : ${dateFormatted}\n`;
    receipt += `Plate   : ${trip?.vehicle_plate || 'ABC-1001'}\n`;
    receipt += `Driver  : ${trip?.driver_name || 'Danilo Driver'}\n`;
    receipt += `${line}\n`;
    receipt += `Customer: ${order.customer_name || customer?.business_name || 'Walk-in Customer'}\n`;
    receipt += `Address : ${customer?.delivery_address || 'On-Route Delivery'}\n`;
    receipt += `${line}\n`;

    if (!isZeroSale) {
      receipt += 'ITEM         QTY    PRICE    TOTAL\n';
      receipt += `${line}\n`;
      for (const item of items) {
        const name = (item.product_name || 'Product').slice(0, 12).padEnd(12);
        const qty = String(item.quantity_sold).padStart(3);
        const price = item.unit_price.toFixed(0).padStart(7);
        const subtotal = item.subtotal.toFixed(0).padStart(8);
        receipt += `${name} ${qty} ${price} ${subtotal}\n`;
      }
      receipt += `${line}\n`;
      receipt += `TOTAL AMOUNT:        PHP ${order.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      receipt += `Payment Method:      ${order.payment_method}\n`;
      if (order.payment_reference) {
        receipt += `Payment Ref:         ${order.payment_reference}\n`;
      }
      receipt += `${line}\n`;
    }

    // Canister Return Ledger
    receipt += '     CANISTER SWAP LEDGER       \n';
    receipt += `${line}\n`;
    for (const item of items) {
      const net = Math.max(0, item.quantity_sold - item.empties_returned) -
                  Math.max(0, item.empties_returned - item.quantity_sold);
      const netStr = net >= 0 ? `+${net}` : `${net}`;
      receipt += `${(item.product_name || 'Item').slice(0, 14)}: Ret:${item.empties_returned} Net:${netStr}\n`;
    }
    if (customer) {
      receipt += `Customer Total Debt: ${customer.canister_debt} unit(s)\n`;
    }
    receipt += `${doubleLine}\n`;
    receipt += '    THIS IS AN OFFICIAL SLIP    \n';
    receipt += '   Thank you for your business! \n';
    receipt += '  Direct Store Delivery (DSD)   \n\n\n';

    return receipt;
  },
};
