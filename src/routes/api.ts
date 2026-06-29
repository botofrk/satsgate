import { Router } from 'express';
import { registerMerchant, getMerchantStats, getMerchantTransactions } from '../controllers/merchant';
import { createInvoice, checkInvoiceStatus } from '../controllers/invoice';
import { handleLnbitsWebhook } from '../controllers/webhook';

const router = Router();

// Merchant routes
router.post('/merchant/register', registerMerchant);
router.get('/merchant/stats', getMerchantStats);
router.get('/merchant/transactions', getMerchantTransactions);

// Invoice routes
router.post('/invoice/create', createInvoice);
router.get('/invoice/status/:hash', checkInvoiceStatus);

// Webhook route
router.post('/lnbits-webhook', handleLnbitsWebhook);

export default router;
