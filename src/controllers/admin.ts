import { Request, Response, NextFunction } from 'express';
import { getDb } from '../config/database';
import { ADMIN_SECRET } from '../config/env';
import { AppError } from '../utils/error';

// Middleware to check Admin Key
export const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.header('X-Admin-Key');
  if (!ADMIN_SECRET) {
    return next(new AppError('Admin key is not configured on the server', 500, 'ADMIN_NOT_CONFIGURED'));
  }
  if (!adminKey || adminKey !== ADMIN_SECRET) {
    return next(new AppError('Unauthorized access', 401, 'UNAUTHORIZED'));
  }
  next();
};

export const getAdminStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    
    const merchantCount = await db.get('SELECT COUNT(*) as count FROM merchants');
    const waitlistCount = await db.get('SELECT COUNT(*) as count FROM waitlist');
    const failedPayouts = await db.get("SELECT COUNT(*) as count FROM payout_queue WHERE status = 'failed'");
    
    res.json({
      status: 'ok',
      merchantCount: merchantCount?.count || 0,
      waitlistCount: waitlistCount?.count || 0,
      failedPayouts: failedPayouts?.count || 0
    });
  } catch (error) {
    next(error);
  }
};

export const getFailedPayouts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const payouts = await db.all("SELECT * FROM payout_queue WHERE status = 'failed' ORDER BY created_at DESC");
    res.json({ status: 'ok', payouts });
  } catch (error) {
    next(error);
  }
};

export const retryPayout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.body;
    if (!id) throw new AppError('Payout ID is required', 400, 'BAD_REQUEST');

    const db = getDb();
    
    const result = await db.run(
      "UPDATE payout_queue SET status = 'pending', attempts = 0, next_retry_at = datetime('now') WHERE id = ? AND status = 'failed'",
      id
    );

    if (result.changes === 0) {
      throw new AppError('Payout not found or not in failed state', 404, 'NOT_FOUND');
    }

    res.json({ status: 'ok', message: 'Payout queued for retry' });
  } catch (error) {
    next(error);
  }
};

export const getWaitlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const waitlist = await db.all("SELECT * FROM waitlist ORDER BY created_at ASC");
    res.json({ status: 'ok', waitlist });
  } catch (error) {
    next(error);
  }
};
