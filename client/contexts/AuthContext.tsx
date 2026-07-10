import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: string | null;
  parentUserId: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
  email: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  role: null,
  parentUserId: null,
  isAuthenticated: false,
  email: null,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
  refreshProfile: async () => {},
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
    parentUserId: null,
  });

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/me`, {
        headers: { 'x-session': session.access_token },
      });

      if (res.ok) {
        const profile = await res.json();
        setState(prev => ({
          ...prev,
          role: profile.role || 'parent',
          parentUserId: profile.parentUserId || null,
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
            parentUserId: null,
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
              }));
              fetchProfile(session.user.id);
            } else {
              setState({
                user: null,
                session: null,
                isLoading: false,
                role: null,
                parentUserId: null,
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

  const signIn = async (email: string, password: string) => {
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
        parentUserId: null,
      });
      await fetchProfile(data.session.user.id);
    }

    return {};
  };

  const signUp = async (email: string, password: string) => {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return { error: error.message };

    // Auto-confirm is enabled, so session should be available
    if (data.session) {
      setState({
        user: data.session.user,
        session: data.session,
        isLoading: false,
        role: null,
        parentUserId: null,
      });

      // Create profile as parent
      const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      try {
        await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/ensure-profile`, {
          method: 'POST',
          headers: {
            'x-session': data.session.access_token,
            'Content-Type': 'application/json',
          },
        });
        await fetchProfile(data.session.user.id);
      } catch {
        // Profile creation failed, will retry on next access
      }
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
      parentUserId: null,
    });
  };

  const refreshProfile = async () => {
    if (state.user) {
      await fetchProfile(state.user.id);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
