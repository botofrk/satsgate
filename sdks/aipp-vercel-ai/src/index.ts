import { tool } from 'ai';
import { z } from 'zod';
import axios from 'axios';

export interface AIPPConfig {
  apiKey: string;
  baseUrl?: string;
  walletType?: 'alby' | 'lnbits';
  walletToken?: string;
  walletUrl?: string;
}

export function aippTopupTool(config: AIPPConfig) {
  const baseUrl = config.baseUrl || 'https://api.aipp.dev';
  const walletType = config.walletType || 'alby';
  const walletToken = config.walletToken || process.env.ALBY_BEARER_TOKEN || process.env.LNBITS_ADMIN_KEY;
  const walletUrl = config.walletUrl || process.env.LNBITS_URL;

  if (!walletToken) {
    throw new Error('AIPP: walletToken is required to pay invoices automatically.');
  }

  const client = axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': config.apiKey },
  });

  return tool({
    description: 'Automatically top up AIPP credits when balance is zero. This tool will fetch an invoice from AIPP, pay it using your configured Lightning wallet, and verify the L402 preimage to recharge the balance.',
    parameters: z.object({
      planId: z.string().default('starter').describe("The plan ID to top up (e.g. 'starter', 'pro')"),
    }),
    execute: async ({ planId }) => {
      try {
        // 1. Get Topup Invoice (402 Challenge)
        let invoice: string | undefined;
        let macaroon: string | undefined;

        try {
          await client.get(`/v1/topup/${planId}`);
          return "Error: Endpoint did not return a 402 Payment Required challenge.";
        } catch (error: any) {
          if (error.response && error.response.status === 402) {
            const authHeader = error.response.headers['www-authenticate'];
            if (authHeader && authHeader.includes('L402')) {
              const parts = authHeader.replace('L402 ', '').split(', ');
              const data: Record<string, string> = {};
              parts.forEach((p: string) => {
                const [k, v] = p.split('=');
                data[k] = v.replace(/"/g, '');
              });
              invoice = data.invoice;
              macaroon = data.macaroon;
            }
          } else {
            throw error;
          }
        }

        if (!invoice || !macaroon) {
          return "Failed to parse L402 challenge from AIPP.";
        }

        // 2. Pay Invoice
        let preimage = '';
        if (walletType === 'alby') {
          const res = await axios.post('https://api.getalby.com/payments/bolt11', {
            invoice,
          }, {
            headers: { Authorization: `Bearer ${walletToken}` }
          });
          preimage = res.data.preimage;
        } else if (walletType === 'lnbits') {
          if (!walletUrl) throw new Error('LNbits walletUrl is required');
          const res = await axios.post(`${walletUrl.replace(/\/$/, '')}/api/v1/payments`, {
            out: true,
            bolt11: invoice,
          }, {
            headers: { 'X-Api-Key': walletToken }
          });
          
          const paymentHash = res.data.payment_hash;
          // Simplistic polling
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const check = await axios.get(`${walletUrl.replace(/\/$/, '')}/api/v1/payments/${paymentHash}`, {
              headers: { 'X-Api-Key': walletToken }
            });
            if (check.data.preimage) {
              preimage = check.data.preimage;
              break;
            }
          }
        }

        if (!preimage) {
          return "Failed to retrieve preimage after payment attempt.";
        }

        // 3. Verify Payment with L402
        const verifyRes = await client.get(`/v1/topup/${planId}`, {
          headers: {
            Authorization: `L402 ${macaroon}:${preimage}`,
          }
        });

        return `Success! Added ${verifyRes.data.credits_added} credits. New balance: ${verifyRes.data.new_balance}.`;

      } catch (err: any) {
        return `AIPP Topup Error: ${err.response?.data?.error || err.message}`;
      }
    },
  });
}
