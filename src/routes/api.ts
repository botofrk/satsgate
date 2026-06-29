import { Router } from 'express';
import { registerMerchant, getMerchantStats, getMerchantTransactions } from '../controllers/merchant';
import { createInvoice, checkInvoiceStatus } from '../controllers/invoice';
import { handleLnbitsWebhook } from '../controllers/webhook';
import { handleChat, createTicket } from '../controllers/chat';

const router = Router();

// Merchant routes
router.post('/merchant/register', registerMerchant);
router.get('/merchant/stats', getMerchantStats);
router.get('/merchant/transactions', getMerchantTransactions);

// Invoice routes
router.post('/invoice/create', createInvoice);
router.get('/invoice/status/:hash', checkInvoiceStatus);

// Chatbot & Support routes
router.post('/chat', handleChat);
router.post('/ticket', createTicket);

// Webhook route
router.post('/lnbits-webhook', handleLnbitsWebhook);

export default router;
