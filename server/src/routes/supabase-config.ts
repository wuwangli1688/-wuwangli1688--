import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSupabaseCredentials } from '../storage/database/supabase-client.js';

const router = Router();

// GET /api/supabase-config - Return Supabase URL and anon key for frontend
router.get('/', (_req: Request, res: Response) => {
  try {
    const { url, anonKey } = getSupabaseCredentials();
    if (!url || !anonKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }
    return res.json({ url, anonKey });
  } catch (error) {
    console.error('Failed to get supabase config:', error);
    return res.status(500).json({ error: 'Failed to get supabase config' });
  }
});

export default router;
