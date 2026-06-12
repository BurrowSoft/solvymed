import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { upsertProfessional, getProfessional, linkByInviteCode, getUserRole, setInvitedByProfessional } from './services';
import { getProfessionalByPublicCode } from './discovery-service';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, locale?: string, role?: string, inviteCode?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  forgotPassword: (email: string, locale?: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resendConfirmation: async () => ({ error: null }),
  changePassword: async () => ({ error: null }),
  forgotPassword: async () => ({ error: null }),
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
      if (session?.user) {
        const role = session.user.user_metadata?.role ?? 'professional';
        if (role === 'professional' || role === 'secretary') {
          ensureProfessional(session.user.id, session.user.email ?? '');
        } else if (role === 'patient') {
          autoLinkPatient(session.user.id, session.user.user_metadata?.invite_code);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function autoLinkPatient(userId: string, inviteCode?: string) {
    if (!inviteCode) return;
    try {
      const existing = await getUserRole(userId);
      if (existing?.linkedPatientId || existing?.invitedByProfessionalId) return;
      // Try patient invite code first
      const linked = await linkByInviteCode(userId, inviteCode);
      if (!linked) {
        // Try professional public invite code
        const prof = await getProfessionalByPublicCode(inviteCode);
        if (prof) {
          await setInvitedByProfessional(userId, prof.professionalId);
        }
      }
    } catch {
      // silently ignore
    }
  }

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

  async function signUp(email: string, password: string, locale?: string, role?: string, inviteCode?: string) {
    const metadata: Record<string, string> = {
      locale: locale ?? 'en',
      role: role ?? 'professional',
      platform: 'mobile',
    };
    if (inviteCode) metadata.invite_code = inviteCode.toUpperCase().trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://www.solvymed.com/auth/confirm',
        data: metadata,
      },
    });
    if (!error && data.user?.identities?.length === 0) {
      return { error: 'already_registered' };
    }
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

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!session?.user?.email) return { error: 'Not authenticated' };
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (authError) return { error: authError.message };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async function forgotPassword(email: string, locale?: string) {
    const webLocale = !locale || locale === 'en' ? '' : `/${locale === 'pt-BR' ? 'pt-BR' : locale.split('-')[0]}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://www.solvymed.com${webLocale}/auth/confirm`,
    });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut, resendConfirmation, changePassword, forgotPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
