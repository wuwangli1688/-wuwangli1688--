import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  parentUserId?: string | null;
}

/**
 * Auth middleware: verify x-session token from Supabase Auth
 * Attaches userId, userRole, parentUserId to the request
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers['x-session'] as string;

  if (!token) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  try {
    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (authError || !user) {
      res.status(401).json({ error: '认证失败，请重新登录' });
      return;
    }

    // Get user profile from our custom table
    const { data: profile } = await getSupabaseClient()
      .from('user_profiles')
      .select('role, parent_user_id')
      .eq('id', user.id)
      .single();

    req.userId = user.id;
    req.userRole = profile?.role ?? 'parent';
    req.parentUserId = profile?.parent_user_id ?? null;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: '认证服务异常' });
  }
}

/**
 * Require parent account role
 */
export function requireParent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'parent') {
    res.status(403).json({ error: '仅主账号可执行此操作' });
    return;
  }
  next();
}
