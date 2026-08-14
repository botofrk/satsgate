import { Router } from 'express';
import { registerMerchant, getMerchantStats, getMerchantTransactions, triggerManualPayout, getPayoutStatus, joinWaitlist, updateWalletSettings, recoverMerchantKey } from '../controllers/merchant';
import { createInvoice, checkInvoiceStatus, getReceipt, streamInvoiceStatus } from '../controllers/invoice';
import { handleLnbitsWebhook } from '../controllers/webhook';
import { handleChat, createTicket } from '../controllers/chat';
import { verifyAdmin, getAdminStats, getFailedPayouts, retryPayout, getWaitlist } from '../controllers/admin';
import { premiumArticle, getPricing } from '../controllers/demo';
import { getPaidMcpManifest, getAippAgentManifest } from '../controllers/manifest';
import { getOpenTag, getOpenTagManifest, unlockOpenTag, getOpenTagReceipt } from '../controllers/openTag';

const router = Router();

// Middleware to prevent caching of sensitive merchant data
import { Request, Response, NextFunction } from 'express';
function disablePrivateCaching(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, X-Api-Key, Cookie');
  next();
}

// Merchant routes
router.get('/paidmcp.json', getPaidMcpManifest);
router.get('/aipp-agent.json', getAippAgentManifest);
router.get('/.well-known/aipp-agent.json', getAippAgentManifest);

router.use('/merchant*', disablePrivateCaching);
router.post('/merchant/register', registerMerchant);
router.post('/merchant/recover', recoverMerchantKey);
router.post('/merchant/waitlist', joinWaitlist);
router.get('/merchant/stats', getMerchantStats);
router.post('/merchant/payout', triggerManualPayout);
router.get('/merchant/payout-status/:payment_hash', getPayoutStatus);
router.get('/merchant/transactions', getMerchantTransactions);
router.patch('/merchant/settings', updateWalletSettings);
router.put('/merchant/settings', updateWalletSettings);

// Invoice routes
router.post('/invoice/create', createInvoice);
router.get('/invoice/status', checkInvoiceStatus);
router.get('/invoice/status/:hash', checkInvoiceStatus);
router.get('/invoice/stream/:hash', streamInvoiceStatus);
router.get('/invoice/stream', streamInvoiceStatus);
router.get('/invoice/receipt/:hash', getReceipt);

// Payment Links & Smart Price Tags
import { createPaymentLink, getPaymentLinks, renderPaymentPage, createLinkInvoice, deletePaymentLink } from '../controllers/payLink';
router.post('/merchant/links/create', createPaymentLink);
router.post('/api/tag/create', createPaymentLink);
router.get('/merchant/links', getPaymentLinks);
router.delete('/merchant/links/:linkId', deletePaymentLink);
router.get('/pay/:linkId', renderPaymentPage);
router.get('/t/:linkId/manifest', getOpenTagManifest);
router.get('/t/:linkId/unlock/:hash', unlockOpenTag);
router.get('/t/:linkId/receipt/:hash', getOpenTagReceipt);
router.get('/t/:linkId', getOpenTag);
router.get('/embed/:linkId', renderPaymentPage);
router.get('/cli/:linkId', renderPaymentPage);
router.post('/pay/:linkId/invoice', createLinkInvoice);
router.post('/t/:linkId/invoice', createLinkInvoice);
router.post('/embed/:linkId/invoice', createLinkInvoice);


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
