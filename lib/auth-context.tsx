import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { upsertProfessional, getProfessional } from './services';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resendConfirmation: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) ensureProfessional(session.user.id, session.user.email ?? '');
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function ensureProfessional(id: string, email: string) {
    try {
      const existing = await getProfessional(id);
      if (!existing) {
        await upsertProfessional(id, email, {
          fullName: email.split('@')[0],
        });
      }
    } catch {
      // Tables may not exist yet — silently ignore
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: 'https://www.solvymed.com/auth/confirm' },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: 'https://www.solvymed.com/auth/confirm' },
    });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
