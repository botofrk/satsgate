import { EventEmitter } from 'events';

export interface InvoiceEventData {
  paid: boolean;
  status: string;
  preimage?: string | null;
  protocol?: string;
  amount_sats?: number;
  usdc_amount?: number;
}

class InvoiceEventEmitter extends EventEmitter {}

// Singleton in-memory event emitter for real-time invoice streaming
export const invoiceEvents = new InvoiceEventEmitter();

// Increase max listeners to support many concurrent checkout pages
invoiceEvents.setMaxListeners(1000);

/**
 * Publishes an update for a specific invoice hash.
 */
export function publishInvoiceUpdate(paymentHash: string, data: InvoiceEventData): void {
  if (!paymentHash) return;
  invoiceEvents.emit(`invoice:${paymentHash}`, data);
}

/**
 * Subscribes to updates for a specific invoice hash.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToInvoice(
  paymentHash: string,
  callback: (data: InvoiceEventData) => void
): () => void {
  const eventName = `invoice:${paymentHash}`;
  invoiceEvents.on(eventName, callback);
  return () => {
    invoiceEvents.off(eventName, callback);
  };
}
