import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Database,
  Menu,
  QrCode,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminUser,
  AuthMeResponse,
  BrandingConfig,
  ExamSchedule,
  ProctorUser,
  Student,
  UserAuthStatus,
} from '../types.ts';
import { apiFetch } from '../lib/supabaseClient.ts';
import { formatAuthIdentifier } from '../lib/defaults.ts';
import { AdminStudentsTab } from './admin/AdminStudentsTab.tsx';
import { AdminMasterTab } from './admin/AdminMasterTab.tsx';
import { AdminSchedulesTab } from './admin/AdminSchedulesTab.tsx';
import {
  AdminProctorsTab,
  AdminSettingsTab,
  AdminUsersTab,
} from './admin/AdminSettingsAndUsersTabs.tsx';
import { EmailAuthForm } from './LoginModal.tsx';

type AdminTab = 'students' | 'master' | 'schedules' | 'settings' | 'admins' | 'proctors';

interface AdminPanelProps {
  auth: AuthMeResponse;
  branding: BrandingConfig;
  superAdminEmail: string;
  supabaseConfigured: boolean;
  onBrandingUpdated: (next: BrandingConfig) => void;
  onSwitchToProctor: () => void;
  onAuthSuccess: () => Promise<void>;
  onOpenSetupGuide: () => void;
}

const NAV_ITEMS: { id: AdminTab; label: string; icon: typeof Users }[] = [
  { id: 'students', label: 'Mahasiswa', icon: Users },
  { id: 'master', label: 'Data Master', icon: Database },
  { id: 'schedules', label: 'Jadwal Ujian', icon: CalendarDays },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
  { id: 'admins', label: 'Akun Admin', icon: ShieldCheck },
  { id: 'proctors', label: 'Pengawas Ujian', icon: UserCheck },
];

export function AdminPanel({
  auth,
  branding,
  superAdminEmail,
  supabaseConfigured,
  onBrandingUpdated,
  onSwitchToProctor,
  onAuthSuccess,
  onOpenSetupGuide,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('students');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [proctors, setProctors] = useState<ProctorUser[]>([]);
  const [authStatusMap, setAuthStatusMap] = useState<Record<string, UserAuthStatus>>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const loadOverview = useCallback(async () => {
    if (!auth.authenticated || !auth.isAdmin) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{
        branding: BrandingConfig;
        students: Student[];
        schedules: ExamSchedule[];
        admins: AdminUser[];
        proctors: ProctorUser[];
        authStatusMap?: Record<string, UserAuthStatus>;
      }>('/api/admin/overview');
      setStudents(res.students || []);
      setSchedules(res.schedules || []);
      setAdmins(res.admins || []);
      setProctors(res.proctors || []);
      setAuthStatusMap(res.authStatusMap || {});
      if (res.branding) onBrandingUpdated(res.branding);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data admin.');
    } finally {
      setLoading(false);
    }
  }, [auth.authenticated, auth.isAdmin, onBrandingUpdated]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleSaveBranding = async (next: BrandingConfig) => {
    const res = await apiFetch<{ branding: BrandingConfig }>('/api/admin/branding', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    if (res.branding) {
      onBrandingUpdated(res.branding);
    }
    notify('Konfigurasi berhasil disimpan ke database.');
  };

  // Auth Gate
  if (!auth.authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
          <EmailAuthForm
            title="Masuk Panel Admin"
            subtitle="Masuk menggunakan username/email dan kata sandi Super Admin atau Admin Akademik terdaftar."
            supabaseConfigured={supabaseConfigured}
            onSuccess={onAuthSuccess}
            onOpenSetupGuide={onOpenSetupGuide}
          />
        </div>
      </div>
    );
  }

  if (!auth.isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="font-academic mt-3 text-xl font-semibold text-stone-900">
            Akses Admin Ditolak
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Akun <span className="font-mono font-semibold">{formatAuthIdentifier(auth.email)}</span> tidak terdaftar pada tabel admin.
          </p>
          {auth.isProctor && (
            <button
              type="button"
              onClick={onSwitchToProctor}
              className="mt-5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B]"
            >
              Buka Mode Pengawas Ujian
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
      {/* Mobile Sidebar Header Bar */}
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Menu Admin
        </button>
        <button
          type="button"
          onClick={onSwitchToProctor}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D1520B]"
        >
          <QrCode className="h-3.5 w-3.5" />
          Mode Pengawas
        </button>
      </div>

      {/* Responsive Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } w-full shrink-0 border-b border-stone-200 bg-white p-4 lg:block lg:min-h-[calc(100vh-65px)] lg:w-64 lg:border-r lg:border-b-0`}
      >
        <div className="mb-4 border-b border-stone-100 pb-3">
          <p className="text-[11px] font-semibold tracking-wider text-[#EA6113] uppercase">
            {auth.isSuperAdmin ? 'Super Admin' : 'Admin Akademik'}
          </p>
          <p className="font-academic mt-0.5 truncate text-base font-semibold text-stone-900">
            {auth.name}
          </p>
          <p className="truncate font-mono text-[11px] text-stone-500">
            {formatAuthIdentifier(auth.email)}
          </p>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#EA6113] text-white'
                    : 'text-stone-600 hover:bg-[#FFE3B3]/35 hover:text-stone-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-stone-200 pt-4">
          <button
            type="button"
            onClick={onSwitchToProctor}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#F88F22]/60 bg-[#FFE3B3]/25 px-3 py-2.5 text-xs font-semibold text-stone-900 transition-colors hover:bg-[#FFE3B3]/50"
          >
            <QrCode className="h-4 w-4 text-[#EA6113]" />
            Mode Pengawas
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span>Panel Admin</span>
            <span>/</span>
            <span className="font-semibold text-stone-900">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#EA6113] ${loading ? 'animate-spin' : ''}`} />
            Segarkan Data
          </button>
        </div>

        {notice && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <span>{errorMsg}</span>
            {errorMsg.toLowerCase().includes('schema cache') && (
              <button
                type="button"
                onClick={onOpenSetupGuide}
                className="rounded border border-red-300 bg-white px-3 py-1 font-semibold text-red-900 hover:bg-red-100"
              >
                Buka Skema SQL Supabase
              </button>
            )}
          </div>
        )}

        {activeTab === 'students' && (
          <AdminStudentsTab
            students={students}
            branding={branding}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}

        {activeTab === 'master' && (
          <AdminMasterTab
            branding={branding}
            onSaveBranding={handleSaveBranding}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}

        {activeTab === 'schedules' && (
          <AdminSchedulesTab
            schedules={schedules}
            branding={branding}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <AdminSettingsTab
            branding={branding}
            onSaveBranding={handleSaveBranding}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}

        {activeTab === 'admins' && (
          <AdminUsersTab
            admins={admins}
            authStatusMap={authStatusMap}
            superAdminEmail={superAdminEmail}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}

        {activeTab === 'proctors' && (
          <AdminProctorsTab
            proctors={proctors}
            authStatusMap={authStatusMap}
            branding={branding}
            onRefresh={loadOverview}
            onNotify={notify}
          />
        )}
      </main>
    </div>
  );
}
