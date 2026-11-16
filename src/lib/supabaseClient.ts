import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthMeResponse, PublicConfigResponse } from '../types.ts';
import { normalizeAuthIdentifier } from './defaults.ts';

let clientPromise: Promise<{
  supabase: SupabaseClient | null;
  config: PublicConfigResponse;
}> | null = null;

export async function getSupabaseInit(): Promise<{
  supabase: SupabaseClient | null;
  config: PublicConfigResponse;
}> {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const res = await fetch('/api/public-config');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const config = (await res.json()) as PublicConfigResponse;
        if (!config.configured || !config.supabaseUrl || !config.supabaseAnonKey) {
          clientPromise = null;
          return { supabase: null, config };
        }
        const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        return { supabase, config };
      } catch (err) {
        clientPromise = null;
        throw err;
      }
    })();
  }
  return clientPromise;
}

export async function signInWithEmailPassword(
  identifier: string,
  password: string
): Promise<void> {
  const { supabase, config } = await getSupabaseInit();
  if (!supabase || !config.configured) {
    throw new Error(
      'Supabase belum dikonfigurasi. Lengkapi SUPABASE_URL dan SUPABASE_ANON_KEY terlebih dahulu.'
    );
  }

  const email = normalizeAuthIdentifier(identifier);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('email not confirmed')) {
      throw new Error(
        'Akun email belum aktif atau terkonfirmasi. Hubungi Admin Utama untuk mengatur kata sandi di Panel Admin.'
      );
    }
    if (msg.includes('invalid login credentials')) {
      throw new Error(
        'Username/email atau kata sandi salah. Pastikan akun dan kata sandi sudah diatur oleh Admin Utama di Panel Admin.'
      );
    }
    throw new Error(error.message);
  }
}

export async function signUpWithEmailPassword(
  identifier: string,
  password: string,
  fullName: string
): Promise<{ needsEmailConfirmation: boolean }> {
  const { supabase, config } = await getSupabaseInit();
  if (!supabase || !config.configured) {
    throw new Error(
      'Supabase belum dikonfigurasi. Lengkapi SUPABASE_URL dan SUPABASE_ANON_KEY terlebih dahulu.'
    );
  }

  const email = normalizeAuthIdentifier(identifier);

  // Activate whitelisted Admin / Proctor account on server (bypasses email confirmation blockage)
  const actRes = await fetch('/api/auth/activate-whitelisted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password, fullName }),
  });
  const actJson = (await actRes.json().catch(() => ({}))) as {
    activated?: boolean;
    error?: string;
  };

  if (!actRes.ok) {
    throw new Error(actJson.error || 'Gagal mengaktifkan akun.');
  }

  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginErr) {
    throw new Error(loginErr.message);
  }

  return {
    needsEmailConfirmation: false,
  };
}

export async function signOutSupabase(): Promise<void> {
  const { supabase } = await getSupabaseInit();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { supabase } = await getSupabaseInit();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  explicitSession?: Session | null
): Promise<T> {
  const token = explicitSession?.access_token ?? (await getAccessToken());
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    const errObj = json as { error?: string };
    throw new Error(errObj?.error || `Permintaan gagal (${res.status})`);
  }

  return json as T;
}

export async function fetchAuthMe(explicitSession?: Session | null): Promise<AuthMeResponse> {
  return apiFetch<AuthMeResponse>('/api/auth/me', {}, explicitSession);
}
