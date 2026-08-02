import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// 注意：管理员 HTML 页面由 server/src/routes/admin.ts 中的 adminLoginRouter 直接提供，
// 本中间件只负责鉴权，不再内联返回 HTML。

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'jizhang-admin-secret-2024';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

export interface AdminRequest extends Request {
  adminId?: string;
}

/**
 * Creates an admin token (HMAC-signed)
 */
export function createAdminToken(): string {
  const payload = JSON.stringify({
    role: 'admin',
    timestamp: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  const base64 = Buffer.from(payload).toString('base64');
  const signature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(base64)
    .digest('hex');
  return base64 + '.' + signature;
}

/**
 * Verify admin credentials
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

/**
 * Verify admin token
 */
function verifyAdminToken(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };

    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf-8'));
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SECRET)
      .update(parts[0])
      .digest('hex');

    if (parts[1] !== expectedSig) return { valid: false };
    if (payload.exp && payload.exp < Date.now()) return { valid: false };

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

/**
 * Admin auth middleware: verify admin token
 */
export function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  let token = req.headers['x-admin-token'] as string;
  if (!token) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: '请先登录管理后台' });
    return;
  }

  const result = verifyAdminToken(token);
  if (!result.valid) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
    return;
  }

  req.adminId = 'admin';
  next();
}
