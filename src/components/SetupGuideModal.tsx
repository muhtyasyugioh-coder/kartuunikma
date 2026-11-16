import { useEffect, useState } from 'react';
import { Check, Copy, Database, X } from 'lucide-react';

interface SetupGuideModalProps {
  open: boolean;
  onClose: () => void;
  superAdminEmail: string;
}

export function SetupGuideModal({ open, onClose, superAdminEmail }: SetupGuideModalProps) {
  const [sql, setSql] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || sql) return;
    fetch('/api/setup/schema')
      .then((r) => r.json())
      .then((data) => {
        if (data?.sql) setSql(data.sql);
      })
      .catch(() => {});
  }, [open, sql]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#EA6113]" />
            <h3 className="font-academic text-lg font-semibold text-stone-900">
              Panduan Koneksi Supabase & RLS PostgreSQL
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 text-sm text-stone-700">
          <div className="rounded-lg border border-stone-200 bg-[#FAF7F2] p-4 space-y-2">
            <p className="font-semibold text-stone-900">1. Variabel Environment Server</p>
            <p className="text-stone-600">
              Tambahkan variabel berikut pada panel Secrets / <code className="font-mono text-xs">.env</code> agar koneksi database dan verifikasi JWT berjalan penuh:
            </p>
            <ul className="space-y-1 font-mono text-xs text-stone-800">
              <li>SUPABASE_URL=https://&lt;project-ref&gt;.supabase.co</li>
              <li>SUPABASE_ANON_KEY=&lt;anon-public-key&gt;</li>
              <li>SUPABASE_SERVICE_ROLE_KEY=&lt;service-role-secret-server-only&gt;</li>
              <li>SUPER_ADMIN_EMAIL={superAdminEmail}</li>
            </ul>
          </div>

          <div className="rounded-lg border border-stone-200 bg-[#FAF7F2] p-4 space-y-2">
            <p className="font-semibold text-stone-900">2. Autentikasi Email & Kata Sandi di Supabase</p>
            <p className="text-stone-600">
              Aktifkan penyedia <span className="font-medium">Email</span> pada menu{' '}
              <span className="font-medium">Authentication &rarr; Providers &rarr; Email</span> di dashboard Supabase Anda. Akun Admin dan Pengawas masuk menggunakan email dan kata sandi tanpa login Google.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-stone-900">
                3. Skema SQL PostgreSQL & Kebijakan RLS (supabase/schema.sql)
              </p>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!sql}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/30"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-[#EA6113]" />}
                {copied ? 'Tersalin' : 'Salin SQL'}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg border border-stone-200 bg-stone-900 p-4 font-mono text-xs leading-relaxed text-stone-100">
              {sql || 'Memuat skema SQL...'}
            </pre>
          </div>
        </div>

        <div className="flex justify-end border-t border-stone-200 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#EA6113] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#D1520B]"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}
