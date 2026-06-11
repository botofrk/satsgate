export { SatsgateClient, type SatsgateClientOptions } from './client.js';
export { SatsgateError } from './errors.js';
export type {
  Challenge,
  VerifyResult,
  Plan,
  BalanceResponse,
  ClientInfo,
  LedgerEntry,
  LedgerResponse,
  UsageSummary,
  UsageDaily,
  UsageForecast,
  ForecastData,
  Recommendation,
} from './types.js';
export { parseL402Authorization, decodeMacaroonPayload } from './helpers.js';
