import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AuthProfile { userId: string; displayName: string; avatarUrl?: string; bio?: string; }

const unavailable = () => { throw new Error('AUTH_UNAVAILABLE'); };

export const getSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const subscribeToAuthChanges = (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
  if (!supabase) return { unsubscribe: () => undefined };
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
};

export const signUp = async ({ email, password, displayName }: { email: string; password: string; displayName: string }) => {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error) throw error;
  return data;
};

export const signIn = async ({ email, password }: { email: string; password: string }) => {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) return unavailable();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resendSignupConfirmation = async (email: string) => {
  if (!supabase) return unavailable();
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (error) throw error;
};

export const fetchProfile = async (userId: string): Promise<AuthProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url, bio').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? { userId: data.id, displayName: data.display_name, avatarUrl: data.avatar_url || undefined, bio: data.bio || undefined } : null;
};

export const updateProfile = async (userId: string, values: { displayName: string; avatarUrl?: string; bio?: string }) => {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.from('profiles').update({ display_name: values.displayName.trim(), avatar_url: values.avatarUrl?.trim() || null, bio: values.bio?.trim() || null }).eq('id', userId).select('id, display_name, avatar_url, bio').single();
  if (error) throw error;
  return { userId: data.id, displayName: data.display_name, avatarUrl: data.avatar_url || undefined, bio: data.bio || undefined } as AuthProfile;
};

export type AuthUser = Pick<User, 'id' | 'email' | 'user_metadata'>;
