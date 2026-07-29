import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getSupabase } from '@/lib/supabase';

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

/**
 * Convert a flexible account input (email, phone, or username) to a valid Supabase email.
 * - If it contains '@' and '.', treat as email (must be ASCII)
 * - Otherwise, percent-encode the account name with @jizhangapp.local domain
 * Supabase only accepts ASCII email addresses, so non-ASCII characters are percent-encoded.
 */
function toSupabaseEmail(account: string): string {
  const trimmed = account.trim();
  if (trimmed.includes('@') && trimmed.includes('.')) {
    return trimmed.toLowerCase();
  }
  // Percent-encode non-ASCII characters safely (works in both browser and Node.js)
  const encoded = encodeURIComponent(trimmed).toLowerCase();
  return `${encoded}@jizhangapp.local`;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: string | null;
  role_title: string | null;
  parentUserId: string | null;
  pendingCount: number;
  displayName: string;
}

interface AuthContextType extends AuthState {
  signIn: (account: string, password: string) => Promise<{ error?: string }>;
  signUp: (account: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPasswordRequest: (account: string) => Promise<{ error?: string; message?: string }>;
  resetPassword: (account: string, code: string, newPassword: string) => Promise<{ error?: string }>;
  isAuthenticated: boolean;
  email: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  role: null,
  role_title: null,
  parentUserId: null,
  pendingCount: 0,
  displayName: '',
  isAuthenticated: false,
  email: null,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => { /* default */ },
  refreshProfile: async () => { /* default */ },
  resetPasswordRequest: async () => ({}),
  resetPassword: async () => ({}),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    role: null,
    role_title: null,
    parentUserId: null,
    pendingCount: 0,
    displayName: '',
  });

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/me`, {
        headers: { 'x-session': session.access_token },
      });

      if (res.ok) {
        const profile = await res.json();
        setState(prev => ({
          ...prev,
          role: profile.role || 'parent',
          role_title: profile.role_title || '',
          parentUserId: profile.parentUserId || null,
          pendingCount: profile.pending_count || 0,
          displayName: profile.displayName || '',
        }));
      }
    } catch {
      // Profile fetch failed, default to parent
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const supabase = await getSupabase();
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setState({
            user: session.user,
            session,
            isLoading: false,
            role: null,
            role_title: null,
            parentUserId: null,
            pendingCount: 0,
            displayName: session.user.user_metadata?.display_name || '',
          });
          await fetchProfile(session.user.id);
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (!mounted) return;
            if (session?.user) {
              setState(prev => ({
                ...prev,
                user: session.user,
                session,
                isLoading: false,
                displayName: session.user.user_metadata?.display_name || '',
              }));
              fetchProfile(session.user.id);
            } else {
              setState({
                user: null,
                session: null,
                isLoading: false,
                role: null,
                role_title: null,
                parentUserId: null,
                pendingCount: 0,
                displayName: '',
              });
            }
          }
        );

        return () => {
          mounted = false;
          subscription.unsubscribe();
        };
      } catch {
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    }

    init();
  }, [fetchProfile]);

  const signIn = async (account: string, password: string) => {
    const email = toSupabaseEmail(account);
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };

    // Manually update state immediately to avoid race condition with navigation
    if (data.session) {
      setState({
        user: data.session.user,
        session: data.session,
        isLoading: false,
        role: null,
        role_title: null,
        parentUserId: null,
        pendingCount: 0,
        displayName: data.session.user.user_metadata?.display_name || '',
      });
      await fetchProfile(data.session.user.id);
    }

    return {};
  };

  const signUp = async (account: string, password: string) => {
    const supabase = await getSupabase();

    // Detect registration source: 'App' (iOS/Android) or 'Web'
    const source = Platform.OS === 'web' ? 'Web' : 'App';

    // Call backend API to register (uses admin API, no email required)
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password, source }),
    });

    const data = await res.json();
    if (!res.ok) return { error: data.error || '注册失败' };

    // Set session in Supabase client so onAuthStateChange fires
    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      setState({
        user: data.session.user,
        session: data.session,
        isLoading: false,
        role: 'parent',
        role_title: null,
        parentUserId: null,
        pendingCount: 0,
        displayName: data.session.user.user_metadata?.display_name || '',
      });
    }

    return {};
  };

  const signOut = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    setState({
      user: null,
      session: null,
      isLoading: false,
      role: null,
      role_title: null,
      parentUserId: null,
      pendingCount: 0,
      displayName: '',
    });
  };

  const refreshProfile = useCallback(async () => {
    if (state.user) {
      await fetchProfile(state.user.id);
    }
  }, [state.user, fetchProfile]);

  const resetPasswordRequest = async (account: string) => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/reset-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || '发送失败' };
      return { message: data.message || '重置链接已发送' };
    } catch {
      return { error: '网络请求失败' };
    }
  };

  const resetPassword = async (account: string, code: string, newPassword: string) => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.trim(), code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || '重置失败' };
      return {};
    } catch {
      return { error: '网络请求失败' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isAuthenticated: !!state.session,
        email: state.user?.email ?? null,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        resetPasswordRequest,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
