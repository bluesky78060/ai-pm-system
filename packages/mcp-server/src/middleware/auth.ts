import type { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.API_KEY;
  if (!expected) {
    console.error('[auth] API_KEY env not set — refusing requests');
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }
  const provided =
    req.header('x-api-key') ??
    req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
