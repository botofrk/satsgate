// Public API surface for @satsgate/vercel-ai

export { satsgatePaywallMiddleware } from './middleware.js';
export type { SatsgateMiddlewareOptions } from './middleware.js';

export { createPaywallTool } from './tool.js';
export type { PaywallToolConfig } from './tool.js';

export { SatsgateClient } from './client.js';

export type { Challenge, VerifyResult, SatsgateError } from './types.js';
