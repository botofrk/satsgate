export class SatsgateError extends Error {
  readonly statusCode?: number;
  readonly data?: Record<string, unknown>;

  constructor(message: string, options?: { statusCode?: number; data?: Record<string, unknown> }) {
    super(message);
    this.name = 'SatsgateError';
    this.statusCode = options?.statusCode;
    this.data = options?.data;
  }
}
