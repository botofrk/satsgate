import { SatsgateClient } from './client.js';

/**
 * Configuration for the paywall tool helpers.
 */
export interface PaywallToolConfig {
  /** Satsgate API key */
  apiKey: string;

  /** Satsgate base URL (default: https://api.aipp.dev) */
  baseUrl?: string;
}

/**
 * Creates a set of Vercel AI SDK-compatible tool definitions for satsgate
 * paywall operations.
 *
 * The returned object contains three tools that can be passed directly to
 * `generateText`, `streamText`, or any other Vercel AI SDK function that
 * accepts a `tools` map:
 *
 * | Tool              | Purpose                                         |
 * |-------------------|-------------------------------------------------|
 * | `checkBalance`    | Query the current credit balance                |
 * | `createChallenge` | Generate an L402 Lightning invoice challenge    |
 * | `verifyPayment`   | Verify an L402 authorization header             |
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { createPaywallTool } from '@satsgate/vercel-ai';
 *
 * const tool = createPaywallTool({ apiKey: process.env.SATSGATE_API_KEY! });
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: {
 *     checkBalance: tool.checkBalance,
 *     createChallenge: tool.createChallenge,
 *     verifyPayment: tool.verifyPayment,
 *   },
 *   prompt: 'Check my satsgate balance',
 * });
 * ```
 */
export function createPaywallTool(config: PaywallToolConfig) {
  const client = new SatsgateClient(config.baseUrl, config.apiKey);

  return {
    // -----------------------------------------------------------------------
    // checkBalance
    // -----------------------------------------------------------------------

    /** Tool: Check the current satsgate credit balance. */
    checkBalance: {
      description: 'Check the current satsgate credit balance',
      parameters: {} as Record<string, never>,
      execute: async () => {
        const result = await client.balance();
        return {
          balance: result.credits,
          client_id: result.client_id,
        };
      },
    },

    // -----------------------------------------------------------------------
    // createChallenge
    // -----------------------------------------------------------------------

    /** Tool: Create an L402 paywall challenge for a resource. */
    createChallenge: {
      description:
        'Create an L402 paywall challenge. Returns an invoice that must be paid before accessing the paywalled resource.',
      parameters: {
        type: 'object' as const,
        properties: {
          resource: {
            type: 'string',
            description: 'The resource identifier to protect',
          },
          amountSats: {
            type: 'number',
            description: 'Payment amount in satoshis',
          },
          memo: {
            type: 'string',
            description: 'Optional invoice memo',
          },
        },
        required: ['resource', 'amountSats'],
      },
      execute: async (params: {
        resource: string;
        amountSats: number;
        memo?: string;
      }) => {
        const challenge = await client.paywallChallenge(
          params.resource,
          params.amountSats,
          params.memo,
        );
        return {
          invoice: challenge.invoice,
          macaroon: challenge.macaroon,
          payment_hash: challenge.payment_hash,
          amount_sats: challenge.amount_sats,
          www_authenticate: challenge.www_authenticate,
          hint: 'Pay the Lightning invoice, then retry with Authorization: L402 <macaroon>:<preimage>',
        };
      },
    },

    // -----------------------------------------------------------------------
    // verifyPayment
    // -----------------------------------------------------------------------

    /** Tool: Verify an L402 payment authorization header. */
    verifyPayment: {
      description:
        'Verify an L402 payment authorization header. Returns verification result with remaining balance.',
      parameters: {
        type: 'object' as const,
        properties: {
          authorizationHeader: {
            type: 'string',
            description:
              'The L402 authorization header: "L402 <macaroon>:<preimage>"',
          },
          expectedResource: {
            type: 'string',
            description: 'Optional expected resource identifier',
          },
        },
        required: ['authorizationHeader'],
      },
      execute: async (params: {
        authorizationHeader: string;
        expectedResource?: string;
      }) => {
        const result = await client.paywallVerify(
          params.authorizationHeader,
          params.expectedResource,
        );
        return {
          ok: result.ok,
          charged_credits: result.charged_credits,
          new_balance: result.new_balance,
          payment_hash: result.payment_hash,
        };
      },
    },
  };
}
