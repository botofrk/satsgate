import { Request, Response, NextFunction } from 'express';

// [HIGH-1 FIX] IS_PRODUCTION_LIKE must be declared BEFORE it is used
const IS_PRODUCTION_LIKE = process.env.NODE_ENV === 'production';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Never log raw error objects that may contain API keys in their response data
  console.error('[Error]', err.stack || err.message || err);
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }

  // Handle generic / unhandled errors — hide internals in production
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: IS_PRODUCTION_LIKE ? 'Something went wrong.' : message,
    code: 'SERVER_ERROR'
  });
};
