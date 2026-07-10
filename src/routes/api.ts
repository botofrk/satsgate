import { Router } from 'express';
import { registerMerchant, getMerchantStats, getMerchantTransactions, triggerManualPayout, getPayoutStatus, joinWaitlist } from '../controllers/merchant';
import { createInvoice, checkInvoiceStatus } from '../controllers/invoice';
import { handleLnbitsWebhook } from '../controllers/webhook';
import { handleChat, createTicket } from '../controllers/chat';
import { verifyAdmin, getAdminStats, getFailedPayouts, retryPayout, getWaitlist } from '../controllers/admin';
import { premiumArticle, getPricing } from '../controllers/demo';

const router = Router();

// Merchant routes
router.post('/merchant/register', registerMerchant);
router.post('/merchant/waitlist', joinWaitlist);
router.get('/merchant/stats', getMerchantStats);
router.post('/merchant/payout', triggerManualPayout);
router.get('/merchant/payout-status/:payment_hash', getPayoutStatus);
router.get('/merchant/transactions', getMerchantTransactions);

// Invoice routes
router.post('/invoice/create', createInvoice);
router.get('/invoice/status/:hash', checkInvoiceStatus);

// Demo Paywall route
router.get('/premium-article-1', premiumArticle);
router.get('/pricing.json', getPricing);

// Admin routes
router.get('/admin/stats', verifyAdmin, getAdminStats);
router.get('/admin/failed-payouts', verifyAdmin, getFailedPayouts);
router.post('/admin/retry-payout', verifyAdmin, retryPayout);
router.get('/admin/waitlist', verifyAdmin, getWaitlist);

// Chatbot & Support routes
router.post('/chat', handleChat);
router.post('/ticket', createTicket);

// Webhook route
router.post('/lnbits-webhook', handleLnbitsWebhook);

export default router;
