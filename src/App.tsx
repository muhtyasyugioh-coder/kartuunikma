import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { AuthMeResponse, BrandingConfig } from './types.ts';
import { DEFAULT_BRANDING, DEFAULT_SUPER_ADMIN_EMAIL } from './lib/defaults.ts';
import {
  fetchAuthMe,
  getSupabaseInit,
  signOutSupabase,
} from './lib/supabaseClient.ts';
import { StudentPortal } from './components/StudentPortal.tsx';
import { ProctorPortal } from './components/ProctorPortal.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { SetupGuideModal } from './components/SetupGuideModal.tsx';
import { LoginModal } from './components/LoginModal.tsx';

type ActiveView = 'student' | 'proctor' | 'admin';

const INITIAL_AUTH: AuthMeResponse = {
  authenticated: false,
  email: null,
  name: null,
  isSuperAdmin: false,
  isAdmin: false,
  isProctor: false,
  adminInfo: null,
  proctorInfo: null,
};

export default function App() {
  const [view, setView] = useState<ActiveView>('student');
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [superAdminEmail, setSuperAdminEmail] = useState(DEFAULT_SUPER_ADMIN_EMAIL);
  const [auth, setAuth] = useState<AuthMeResponse>(INITIAL_AUTH);
  const [loginOpen, setLoginOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const syncAuth = useCallback(async () => {
    try {
      const me = await fetchAuthMe();
      setAuth(me);
    } catch {
      setAuth(INITIAL_AUTH);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const res = await fetch('/api/student/bootstrap');
        if (res.ok) {
          const data = await res.json();
          if (data.branding) setBranding(data.branding);
          setSupabaseConfigured(Boolean(data.configured));
        }
      } catch {
        // Use default branding gracefully
      }

      try {
        const { supabase, config } = await getSupabaseInit();
        setSupabaseConfigured(config.configured);
        if (config.superAdminEmail) setSuperAdminEmail(config.superAdminEmail);

        await syncAuth();

        if (supabase) {
          const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
              const me = await fetchAuthMe(session);
              setAuth(me);
            } catch {
              setAuth(INITIAL_AUTH);
            }
          });
          unsubscribe = () => data.subscription.unsubscribe();
        }
      } catch {
        // Fallback cleanly if config endpoint is temporarily unavailable
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, [syncAuth]);

  const handleLogout = async () => {
    await signOutSupabase();
    setAuth(INITIAL_AUTH);
    setView('student');
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-900">
      {/* Sunset Palette Top Hairline Bar */}
      <div className="sunset-accent-bar h-1 w-full no-print" />

      {/* Top Navigation Bar (Strict 3-Zone Contract, Hidden on Print) */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-xs no-print">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setView('student')}
            className="flex items-center gap-2.5 text-left font-academic text-lg font-semibold tracking-tight text-stone-900 whitespace-nowrap shrink-0 sm:text-xl"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-[#EA6113] ring-4 ring-[#FFE3B3]/80"
              aria-hidden="true"
            />
            <span>{branding.campus_name}</span>
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => setView('student')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'student'
                  ? 'border-[#EA6113] font-semibold text-[#EA6113]'
                  : 'border-transparent text-stone-600 hover:text-[#EA6113]'
              }`}
            >
              Portal Mahasiswa
            </button>
            <button
              type="button"
              onClick={() => setView('proctor')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'proctor'
                  ? 'border-[#EA6113] font-semibold text-[#EA6113]'
                  : 'border-transparent text-stone-600 hover:text-[#EA6113]'
              }`}
            >
              Mode Pengawas
            </button>
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'admin'
                  ? 'border-[#EA6113] font-semibold text-[#EA6113]'
                  : 'border-transparent text-stone-600 hover:text-[#EA6113]'
              }`}
            >
              Panel Admin
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            {auth.authenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap shrink-0"
                title={`Masuk sebagai ${auth.email}`}
              >
                <LogOut className="h-3.5 w-3.5 text-[#EA6113]" />
                Keluar ({auth.name?.split(' ')[0] || 'Akun'})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#D1520B] whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                Masuk
              </button>
            )}
          </div>
        </div>

        {/* Mobile Sub-Navigation */}
        <div className="flex items-center justify-around border-t border-stone-100 px-2 py-1.5 md:hidden">
          <button
            type="button"
            onClick={() => setView('student')}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              view === 'student'
                ? 'font-semibold text-[#EA6113] underline decoration-[#EA6113] underline-offset-4'
                : 'text-stone-600'
            }`}
          >
            Mahasiswa
          </button>
          <button
            type="button"
            onClick={() => setView('proctor')}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              view === 'proctor'
                ? 'font-semibold text-[#EA6113] underline decoration-[#EA6113] underline-offset-4'
                : 'text-stone-600'
            }`}
          >
            Pengawas
          </button>
          <button
            type="button"
            onClick={() => setView('admin')}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              view === 'admin'
                ? 'font-semibold text-[#EA6113] underline decoration-[#EA6113] underline-offset-4'
                : 'text-stone-600'
            }`}
          >
            Admin
          </button>
        </div>
      </header>

      {/* Active View */}
      {view === 'student' && (
        <StudentPortal
          branding={branding}
          supabaseConfigured={supabaseConfigured}
          onOpenSetupGuide={() => setSetupOpen(true)}
        />
      )}

      {view === 'proctor' && (
        <ProctorPortal
          auth={auth}
          branding={branding}
          supabaseConfigured={supabaseConfigured}
          onAuthSuccess={syncAuth}
          onOpenSetupGuide={() => setSetupOpen(true)}
          onOpenAdmin={auth.isAdmin ? () => setView('admin') : undefined}
        />
      )}

      {view === 'admin' && (
        <AdminPanel
          auth={auth}
          branding={branding}
          superAdminEmail={superAdminEmail}
          supabaseConfigured={supabaseConfigured}
          onBrandingUpdated={setBranding}
          onSwitchToProctor={() => setView('proctor')}
          onAuthSuccess={syncAuth}
          onOpenSetupGuide={() => setSetupOpen(true)}
        />
      )}

      {/* Quiet Footer */}
      <footer className="mt-12 border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500 no-print">
        <div className="mx-auto flex max-w-[1380px] flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
          <span>{branding.footer_copyright}</span>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="font-medium text-stone-600 hover:text-[#EA6113] hover:underline"
          >
            Skema SQL & Panduan Supabase
          </button>
        </div>
      </footer>

      <LoginModal
        open={loginOpen}
        supabaseConfigured={supabaseConfigured}
        onClose={() => setLoginOpen(false)}
        onSuccess={syncAuth}
        onOpenSetupGuide={() => setSetupOpen(true)}
      />

      <SetupGuideModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        superAdminEmail={superAdminEmail}
      />
    </div>
  );
}
