import { Router } from 'express';
import { registerMerchant, getMerchantStats, getMerchantTransactions, triggerManualPayout, getPayoutStatus, joinWaitlist, updateWalletSettings, requestRecoveryChallenge, verifyRecoveryChallenge } from '../controllers/merchant';
import { createInvoice, checkInvoiceStatus, getReceipt, streamInvoiceStatus } from '../controllers/invoice';
import { handleLnbitsWebhook } from '../controllers/webhook';
import { handleChat, createTicket } from '../controllers/chat';
import { verifyAdmin, getAdminStats, getFailedPayouts, retryPayout, getWaitlist, getMerchantsList } from '../controllers/admin';
import { premiumArticle, getPricing } from '../controllers/demo';
import { getPaidMcpManifest, getAippAgentManifest, getOpenTagSpec } from '../controllers/manifest';

const router = Router();

// Protocol spec (referenced by every Smart Tag manifest "spec" field)
router.get('/spec/open-tag/1.0', getOpenTagSpec);

// Middleware to prevent caching of sensitive merchant data
import { Request, Response, NextFunction } from 'express';
function disablePrivateCaching(req: Request, res: Response, next: NextFunction) {
  if (req.path && req.path.startsWith('/merchant')) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Vary', 'Authorization, X-Api-Key, Cookie');
  }
  next();
}

// Merchant routes
router.get('/paidmcp.json', getPaidMcpManifest);
router.get('/aipp-agent.json', getAippAgentManifest);
router.get('/.well-known/aipp-agent.json', getAippAgentManifest);

import {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  addPasskeyOptions,
  addPasskeyVerify,
  listPasskeys,
  deletePasskey,
  migratePasskeyOptions,
  verifyMigratePasskey,
  getSession,
  logout,
  requireMerchantSession
} from '../controllers/passkeyAuth';

// Passkey Authentication Routes
router.post('/auth/passkey/register/options', registerOptions);
router.post('/auth/passkey/register/verify', registerVerify);
router.post('/auth/passkey/login/options', loginOptions);
router.post('/auth/passkey/login/verify', loginVerify);

router.post('/auth/passkey/migrate/options', migratePasskeyOptions);
router.post('/auth/passkey/migrate/verify', verifyMigratePasskey);

router.get('/auth/session', requireMerchantSession, getSession);
router.post('/auth/logout', logout);

router.post('/auth/passkey/add/options', requireMerchantSession, addPasskeyOptions);
router.post('/auth/passkey/add/verify', requireMerchantSession, addPasskeyVerify);
router.get('/auth/passkeys', requireMerchantSession, listPasskeys);
router.delete('/auth/passkeys/:id', requireMerchantSession, deletePasskey);

router.use(disablePrivateCaching);
router.post('/merchant/register', registerMerchant);
router.post('/merchant/recovery/challenge', requestRecoveryChallenge);
router.post('/merchant/recovery/verify', verifyRecoveryChallenge);
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
import { getOpenTag, getOpenTagManifest, getOpenTagContent, issueOpenTagAccessToken, unlockOpenTag, getOpenTagReceipt } from '../controllers/openTag';
router.post('/merchant/links/create', createPaymentLink);
router.post('/api/tag/create', createPaymentLink);
router.get('/merchant/links', getPaymentLinks);
router.delete('/merchant/links/:linkId', deletePaymentLink);
router.get('/pay/:linkId', renderPaymentPage);
router.get('/t/:linkId/manifest', getOpenTagManifest);
router.get('/t/:linkId/content', getOpenTagContent);
router.post('/t/:linkId/access-token', issueOpenTagAccessToken);
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
router.get('/admin/merchants', verifyAdmin, getMerchantsList);
router.get('/admin/failed-payouts', verifyAdmin, getFailedPayouts);
router.post('/admin/retry-payout', verifyAdmin, retryPayout);
router.get('/admin/waitlist', verifyAdmin, getWaitlist);

// Chatbot & Support routes
router.post('/chat', handleChat);
router.post('/ticket', createTicket);

// Webhook route
router.post('/lnbits-webhook', handleLnbitsWebhook);

// Scenario Distribution Engine & Sitemap routes
import { renderUseCasesIndex, renderUseCaseDetail, renderSitemapXml } from '../controllers/useCases';
router.get('/use-cases', renderUseCasesIndex);
router.get('/use-cases/', renderUseCasesIndex);
router.get('/use%20cases', (req, res) => res.redirect(301, '/use-cases'));
router.get('/use cases', (req, res) => res.redirect(301, '/use-cases'));
router.get('/use-cases/:slug', renderUseCaseDetail);

// Store routes
import path from 'path';
router.get('/store', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/store/index.html'));
});
router.get('/store/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/store/index.html'));
});
router.get('/store/freelance-designer-client-os', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/store/freelance-designer-client-os.html'));
});
router.get('/store/freelance-designer-client-os/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/store/freelance-designer-client-os.html'));
});

router.get('/sitemap.xml', renderSitemapXml);

export default router;
