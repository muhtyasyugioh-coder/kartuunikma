import { useState, type FormEvent } from 'react';
import { Lock, LogIn, User, X } from 'lucide-react';
import { signInWithEmailPassword } from '../lib/supabaseClient.ts';

interface AuthCardProps {
  title: string;
  subtitle: string;
  supabaseConfigured: boolean;
  onSuccess: () => Promise<void> | void;
  onOpenSetupGuide?: () => void;
}

export function EmailAuthForm({
  title,
  subtitle,
  supabaseConfigured,
  onSuccess,
  onOpenSetupGuide,
}: AuthCardProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supabaseConfigured) {
      setErrorMsg('Supabase belum dikonfigurasi pada environment server.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailPassword(identifier, password);
      await onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Autentikasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="font-academic text-xl font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">{subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3 text-left">
        <div>
          <label className="block text-xs font-semibold text-stone-700">Username atau Email</label>
          <div className="relative mt-1">
            <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              required
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="adminkartuunikma"
              className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700">Kata Sandi</label>
          <div className="relative mt-1">
            <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              required
              minLength={6}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi"
              className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
            />
          </div>
        </div>

        {errorMsg && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EA6113] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {loading ? 'Memproses...' : 'Masuk ke Portal'}
        </button>

        {!supabaseConfigured && onOpenSetupGuide && (
          <button
            type="button"
            onClick={onOpenSetupGuide}
            className="w-full text-center text-xs font-semibold text-[#C24908] underline"
          >
            Lihat Panduan Konfigurasi Supabase
          </button>
        )}
      </form>
    </div>
  );
}

interface LoginModalProps {
  open: boolean;
  supabaseConfigured: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  onOpenSetupGuide: () => void;
}

export function LoginModal({
  open,
  supabaseConfigured,
  onClose,
  onSuccess,
  onOpenSetupGuide,
}: LoginModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>

        <EmailAuthForm
          title="Masuk Akun Akademik"
          subtitle="Gunakan username atau email yang terdaftar sebagai Admin atau Pengawas Ujian."
          supabaseConfigured={supabaseConfigured}
          onSuccess={async () => {
            await onSuccess();
            onClose();
          }}
          onOpenSetupGuide={() => {
            onClose();
            onOpenSetupGuide();
          }}
        />
      </div>
    </div>
  );
}
