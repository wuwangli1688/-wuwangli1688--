import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

let supabaseInstance: ReturnType<typeof createClient> | null = null;
let configPromise: Promise<{ url: string; anonKey: string }> | null = null;

async function fetchConfig(): Promise<{ url: string; anonKey: string }> {
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/supabase-config`);
    if (!res.ok) throw new Error('Failed to fetch Supabase config');
    const data = await res.json();
    if (!data.url || !data.anonKey) throw new Error('Invalid Supabase config');
    return { url: data.url, anonKey: data.anonKey };
  })();

  return configPromise;
}

export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  const { url, anonKey } = await fetchConfig();
  supabaseInstance = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Authenticated fetch wrapper - automatically adds x-session header
 */
export async function authFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('未登录');
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'x-session': token,
      'Content-Type': 'application/json',
    },
  });
}
