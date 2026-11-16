import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AdminRole,
  AdminUser,
  BrandingConfig,
  ProctorUser,
  UserAuthStatus,
} from '../../types.ts';
import { apiFetch } from '../../lib/supabaseClient.ts';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  formatAuthIdentifier,
  formatDateTimeId,
} from '../../lib/defaults.ts';
import {
  generateSupabaseImportSql,
  parseBackupJsonPayload,
  type BackupImportOptions,
  type ParsedBackupPayload,
} from '../../lib/backupImport.ts';

export function AdminSettingsTab({
  branding,
  onSaveBranding,
  onRefresh,
  onNotify,
}: {
  branding: BrandingConfig;
  onSaveBranding: (next: BrandingConfig) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<BrandingConfig>(branding);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Backup JSON Importer state
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [backupFileName, setBackupFileName] = useState('');
  const [rawBackupObj, setRawBackupObj] = useState<unknown>(null);
  const [parsedBackup, setParsedBackup] = useState<ParsedBackupPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);
  const [importResultMsg, setImportResultMsg] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState<BackupImportOptions>({
    importStudents: true,
    importSchedules: true,
    importMasterData: true,
    importIdentity: false,
    preserveSunsetColors: true,
    importUsers: true,
    importAttendance: true,
  });

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveBranding(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleBackupFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    setImportResultMsg(null);
    setBackupFileName(file.name);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const parsed = parseBackupJsonPayload(json);
      setRawBackupObj(json);
      setParsedBackup(parsed);
      setImportOptions({
        importStudents: parsed.students.length > 0,
        importSchedules: parsed.schedules.length > 0,
        importMasterData: Boolean(parsed.masterData),
        importIdentity: false,
        preserveSunsetColors: true,
        importUsers: parsed.admins.length > 0 || parsed.proctors.length > 0,
        importAttendance: parsed.attendance.length > 0,
      });
    } catch (err) {
      setRawBackupObj(null);
      setParsedBackup(null);
      setParseError(
        err instanceof Error ? err.message : 'Gagal membaca file JSON backup.'
      );
    }
  };

  const handleImportToSupabase = async () => {
    if (!rawBackupObj || !parsedBackup) return;
    setImportingBackup(true);
    setParseError(null);
    setImportResultMsg(null);
    try {
      const res = await apiFetch<{
        imported: {
          students: number;
          schedules: number;
          admins: number;
          proctors: number;
          attendance: number;
          masterUpdated: boolean;
          identityUpdated: boolean;
        };
      }>('/api/admin/import-backup', {
        method: 'POST',
        body: JSON.stringify({
          backup: rawBackupObj,
          options: importOptions,
        }),
      });
      await onRefresh();
      const parts: string[] = [];
      if (res.imported.students > 0) parts.push(`${res.imported.students} mahasiswa`);
      if (res.imported.schedules > 0) parts.push(`${res.imported.schedules} paket jadwal`);
      if (res.imported.masterUpdated) parts.push('data master akademik');
      if (res.imported.identityUpdated) parts.push('identitas kampus');
      if (res.imported.admins > 0) parts.push(`${res.imported.admins} admin`);
      if (res.imported.proctors > 0) parts.push(`${res.imported.proctors} pengawas`);
      if (res.imported.attendance > 0) parts.push(`${res.imported.attendance} presensi`);
      const summaryText =
        parts.length > 0
          ? `Berhasil mengimpor ke Supabase: ${parts.join(', ')}.`
          : 'Proses selesai tanpa perubahan data.';
      setImportResultMsg(summaryText);
      onNotify(summaryText);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Gagal mengimpor backup ke Supabase.'
      );
    } finally {
      setImportingBackup(false);
    }
  };

  const handleDownloadSql = () => {
    if (!parsedBackup) return;
    const sql = generateSupabaseImportSql(parsedBackup, importOptions, draft);
    const blob = new Blob([sql], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'import_backup_supabase.sql');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('File SQL (import_backup_supabase.sql) berhasil diunduh.');
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h3 className="font-academic text-lg font-semibold text-stone-900">
            Pengaturan Identitas Kampus & Kartu Ujian
          </h3>
          <p className="text-xs text-stone-500">
            Menyesuaikan kop kampus, warna aksen kartu, catatan tata tertib, dan teks hak cipta.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
          <h4 className="text-sm font-semibold text-stone-900">Identitas Institusi</h4>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Nama Kampus</label>
            <input
              value={draft.campus_name}
              onChange={(e) => setDraft({ ...draft, campus_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Motto Kampus</label>
            <input
              value={draft.motto}
              onChange={(e) => setDraft({ ...draft, motto: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">URL Logo Kampus (Opsional)</label>
            <input
              value={draft.logo_url}
              onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })}
              placeholder="https://.../logo.png"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Warna Primer</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.primary_color}
                    onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-stone-300"
                  />
                  <input
                    value={draft.primary_color}
                    onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-xs focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Warna Sekunder</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.secondary_color}
                    onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-stone-300"
                  />
                  <input
                    value={draft.secondary_color}
                    onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })}
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-xs focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F88F22]/40 bg-[#FFE3B3]/25 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="h-3.5 w-3.5 rounded-full bg-[#EA6113]" />
                  <span className="h-3.5 w-3.5 rounded-full bg-[#F88F22]" />
                  <span className="h-3.5 w-3.5 rounded-full bg-[#FBB931]" />
                  <span className="h-3.5 w-3.5 rounded-full border border-stone-300 bg-[#FFE3B3]" />
                </span>
                <span className="text-[11px] font-medium text-stone-700">Palet Sunset</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    primary_color: '#EA6113',
                    secondary_color: '#F88F22',
                  })
                }
                className="rounded-md border border-[#F88F22]/60 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#C24908] transition-colors hover:bg-[#FFE3B3]/50"
              >
                Terapkan Palet Sunset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">Penandatangan Default</label>
              <input
                value={draft.signatory_name}
                onChange={(e) => setDraft({ ...draft, signatory_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Jabatan Default</label>
              <input
                value={draft.signatory_role}
                onChange={(e) => setDraft({ ...draft, signatory_role: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Footer Copyright Kartu</label>
            <input
              value={draft.footer_copyright}
              onChange={(e) => setDraft({ ...draft, footer_copyright: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>
        </div>

        {/* Tata Tertib */}
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
          <h4 className="text-sm font-semibold text-stone-900">
            Catatan Penting & Tata Tertib Ujian
          </h4>

          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Tambah poin tata tertib..."
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const v = newNote.trim();
                if (!v) return;
                setDraft({ ...draft, important_notes: [...draft.important_notes, v] });
                setNewNote('');
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#EA6113] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B]"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah
            </button>
          </div>

          <ol className="divide-y divide-stone-100 border-t border-stone-200">
            {draft.important_notes.map((note, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 py-2.5 text-xs text-stone-700">
                <span>
                  <span className="mr-1.5 font-mono font-semibold text-stone-400">{idx + 1}.</span>
                  {note}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      important_notes: draft.important_notes.filter((_, i) => i !== idx),
                    })
                  }
                  className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </form>

    <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#F88F22]/50 bg-[#FFE3B3]/40 text-[#C24908]">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-academic text-base font-semibold text-stone-900">
              Impor &amp; Pulihkan Backup Database (.json)
            </h4>
            <p className="mt-0.5 text-xs text-stone-500">
              Mendukung file backup JSON dari sistem lama (Firebase/Firestore) maupun ekspor Portal Ujian. Nama kolom dan struktur data disesuaikan otomatis ke tabel PostgreSQL Supabase.
            </p>
          </div>
        </div>

        <div>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              handleBackupFileSelected(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#F88F22] bg-[#FFE3B3]/35 px-4 py-2 text-xs font-semibold text-[#C24908] transition-colors hover:bg-[#FFE3B3]/60"
          >
            <Upload className="h-3.5 w-3.5" />
            Pilih File Backup (.json)
          </button>
        </div>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{parseError}</span>
        </div>
      )}

      {importResultMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <span>{importResultMsg}</span>
        </div>
      )}

      {parsedBackup && (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-[#FAF7F2] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
              <FileJson className="h-4 w-4 text-[#EA6113]" />
              <span>{backupFileName}</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-stone-600 border border-stone-200">
                Sumber: {parsedBackup.meta.sourceType === 'firestore' ? 'Firestore Export' : 'Portal JSON'}
              </span>
            </div>
            {parsedBackup.meta.exportedAt && (
              <span className="font-mono text-[11px] text-stone-500">
                Diekspor: {formatDateTimeId(parsedBackup.meta.exportedAt)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Mahasiswa</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.students.length}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Paket Jadwal</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.schedules.length}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Fakultas</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.masterData?.faculties.length || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Mata Kuliah</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.masterData?.subjects.length || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Admin &amp; Pengawas</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.admins.length + parsedBackup.proctors.length}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <p className="text-[11px] text-stone-500">Presensi Ujian</p>
              <p className="font-mono text-base font-bold text-stone-900">
                {parsedBackup.attendance.length}
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-stone-200 pt-3">
            <p className="text-xs font-semibold text-stone-800">
              Pilih bagian data yang ingin dimasukkan ke Supabase:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importStudents}
                  disabled={parsedBackup.students.length === 0}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importStudents: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>Data Mahasiswa ({parsedBackup.students.length} data, upsert NIM)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importSchedules}
                  disabled={parsedBackup.schedules.length === 0}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importSchedules: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>Paket Jadwal Ujian ({parsedBackup.schedules.length} paket)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importMasterData}
                  disabled={!parsedBackup.masterData}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importMasterData: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>Data Master (Fakultas, Prodi, Kelas, Matkul, Dosen, Ruang)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importUsers}
                  disabled={parsedBackup.admins.length === 0 && parsedBackup.proctors.length === 0}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importUsers: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>
                  Daftar Admin &amp; Pengawas ({parsedBackup.admins.length} admin,{' '}
                  {parsedBackup.proctors.length} pengawas)
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importIdentity}
                  disabled={!parsedBackup.identityData}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importIdentity: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>Identitas Kampus, Logo, Penandatangan &amp; Tata Tertib</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.importAttendance}
                  disabled={parsedBackup.attendance.length === 0}
                  onChange={(e) =>
                    setImportOptions({ ...importOptions, importAttendance: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>Data Presensi Ujian ({parsedBackup.attendance.length} baris)</span>
              </label>
            </div>

            {importOptions.importIdentity && (
              <label className="mt-2 flex items-center gap-2 rounded-lg border border-[#F88F22]/40 bg-white px-3 py-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={importOptions.preserveSunsetColors}
                  onChange={(e) =>
                    setImportOptions({
                      ...importOptions,
                      preserveSunsetColors: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#EA6113] focus:ring-[#EA6113]"
                />
                <span>
                  Pertahankan warna tema Palet Sunset saat ini (#EA6113 / #F88F22) agar tidak kembali ke warna biru lama (#1e3a8a)
                </span>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
            <p className="text-[11px] text-stone-500">
              Catatan: Akun admin yang diimpor dari backup tetap perlu diatur kata sandinya via menu <span className="font-semibold text-stone-700">Akun Admin → Atur Sandi</span> agar dapat login.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSql}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Download className="h-3.5 w-3.5 text-stone-600" />
                Unduh Script SQL (.sql)
              </button>
              <button
                type="button"
                disabled={importingBackup}
                onClick={handleImportToSupabase}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
              >
                <Database className="h-3.5 w-3.5" />
                {importingBackup ? 'Mengimpor ke Supabase...' : 'Impor ke Database Supabase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function renderAuthStatusText(status: UserAuthStatus | undefined) {
  if (status === 'active') {
    return <span className="font-semibold text-emerald-700">Aktif (Siap Login)</span>;
  }
  if (status === 'unconfirmed') {
    return <span className="font-semibold text-[#C24908]">Belum Konfirmasi</span>;
  }
  if (status === 'no_auth') {
    return <span className="font-semibold text-red-700">Belum Ada Sandi</span>;
  }
  return <span className="text-stone-400">—</span>;
}

function SetPasswordModal({
  target,
  onClose,
  onSaved,
  onNotify,
}: {
  target: { email: string; name: string } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!target) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.trim().length < 6) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/users/set-password', {
        method: 'POST',
        body: JSON.stringify({
          email: target.email,
          name: target.name,
          password: newPassword.trim(),
        }),
      });
      setNewPassword('');
      await onSaved();
      onNotify(`Kata sandi akun ${formatAuthIdentifier(target.email)} berhasil diatur & diaktifkan.`);
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengatur kata sandi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <h3 className="font-academic text-lg font-semibold text-stone-900">
            Atur Kata Sandi Login
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:text-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm">
          <div>
            <p className="text-xs text-stone-500">Akun Tujuan</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-stone-900">
              {formatAuthIdentifier(target.email)} ({target.name})
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700">
              Kata Sandi Baru (Min. 6 karakter)
            </label>
            <input
              required
              minLength={6}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Masukkan kata sandi baru"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-[#FAF7F2]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan & Aktifkan Akun'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminUsersTab({
  admins,
  authStatusMap,
  superAdminEmail,
  onRefresh,
  onNotify,
}: {
  admins: AdminUser[];
  authStatusMap: Record<string, UserAuthStatus>;
  superAdminEmail: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [saving, setSaving] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<{ email: string; name: string } | null>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ authProvisioned?: boolean }>('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          password: password.trim() || undefined,
        }),
      });
      setEmail('');
      setName('');
      setPassword('');
      await onRefresh();
      onNotify(
        res.authProvisioned
          ? 'Akun Admin ditambahkan dan langsung aktif untuk login.'
          : 'Akun Admin ditambahkan. Klik tombol "Atur Sandi" pada tabel untuk mengaktifkan login.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menambah admin.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetEmail: string) => {
    try {
      await apiFetch(`/api/admin/admins/${encodeURIComponent(targetEmail)}`, {
        method: 'DELETE',
      });
      await onRefresh();
      onNotify(`Admin ${targetEmail} dihapus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus admin.');
    }
  };

  const protectedSuper = (superAdminEmail || DEFAULT_SUPER_ADMIN_EMAIL).toLowerCase();

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-stone-200 bg-white p-5 space-y-4"
      >
        <div>
          <h3 className="font-academic text-lg font-semibold text-stone-900">Kelola Akun Admin</h3>
          <p className="text-xs text-stone-500">
            Email yang terdaftar di sini memiliki akses penuh ke Panel Admin saat masuk menggunakan Username/Email & Kata Sandi.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Username atau Email"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama Lengkap Admin"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Kata Sandi Login (Min. 6)"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Menyimpan...' : 'Tambah Admin'}
          </button>
        </div>
        <p className="text-[11px] text-stone-500">
          Isi kata sandi agar akun baru bisa langsung login tanpa perlu verifikasi email. Jika dikosongkan, kata sandi dapat diatur kapan saja melalui tombol <span className="font-semibold text-stone-700">Atur Sandi</span> di tabel di bawah.
        </p>
      </form>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-[#FAF7F2] text-xs font-semibold text-stone-600">
              <th className="px-4 py-3">Username / Email</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status Login</th>
              <th className="px-4 py-3">Ditambahkan</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {admins.map((a) => {
              const isPrimary =
                a.email.toLowerCase() === protectedSuper ||
                a.email.toLowerCase() === 'adminkartuunikma@unikma.local';
              const authStatus = authStatusMap[a.email.toLowerCase()];
              return (
                <tr key={a.email} className="hover:bg-[#FAF7F2]/60">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-stone-900">
                    {formatAuthIdentifier(a.email)}
                  </td>
                  <td className="px-4 py-3 text-stone-800">{a.name}</td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        a.role === 'superadmin' ? 'text-[#C24908]' : 'text-stone-700'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {a.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{renderAuthStatusText(authStatus)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-500 tabular-nums">
                    {formatDateTimeId(a.added_at)} · {a.added_by}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPasswordTarget({ email: a.email, name: a.name })}
                        className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
                      >
                        <KeyRound className="h-3 w-3 text-[#EA6113]" />
                        Atur Sandi
                      </button>
                      {isPrimary ? (
                        <span className="px-1 text-[11px] font-medium text-stone-400">Utama</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(a.email)}
                          className="rounded border border-stone-200 p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SetPasswordModal
        target={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onSaved={onRefresh}
        onNotify={onNotify}
      />
    </div>
  );
}

export function AdminProctorsTab({
  proctors,
  authStatusMap,
  branding,
  onRefresh,
  onNotify,
}: {
  proctors: ProctorUser[];
  authStatusMap: Record<string, UserAuthStatus>;
  branding: BrandingConfig;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [assignedRoom, setAssignedRoom] = useState(branding.rooms[0] || '');
  const [faculty, setFaculty] = useState(branding.faculties[0]?.name || '');
  const [saving, setSaving] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<{ email: string; name: string } | null>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ authProvisioned?: boolean }>('/api/admin/proctors', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          assigned_room: assignedRoom,
          faculty,
          password: password.trim() || undefined,
        }),
      });
      setEmail('');
      setName('');
      setPassword('');
      await onRefresh();
      onNotify(
        res.authProvisioned
          ? 'Pengawas ujian ditambahkan dan langsung aktif untuk login.'
          : 'Pengawas ujian ditambahkan. Klik tombol "Atur Sandi" pada tabel untuk mengaktifkan login.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menambah pengawas.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetEmail: string) => {
    try {
      await apiFetch(`/api/admin/proctors/${encodeURIComponent(targetEmail)}`, {
        method: 'DELETE',
      });
      await onRefresh();
      onNotify(`Pengawas ${targetEmail} dihapus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus pengawas.');
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-stone-200 bg-white p-5 space-y-4"
      >
        <div>
          <h3 className="font-academic text-lg font-semibold text-stone-900">
            Kelola Pengawas Ujian
          </h3>
          <p className="text-xs text-stone-500">
            Daftarkan akun email pengawas, kata sandi awal (opsional), dan ruang ujian default agar otomatis terisi saat membuka Mode Pengawas.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            required
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Username atau Email"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama Pengawas"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sandi Awal (Opsional)"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <select
            value={assignedRoom}
            onChange={(e) => setAssignedRoom(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            <option value="">Ruang Default (Opsional)</option>
            {branding.rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            <option value="">Semua Fakultas</option>
            {branding.faculties.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Menyimpan...' : 'Tambah Pengawas'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-[#FAF7F2] text-xs font-semibold text-stone-600">
              <th className="px-4 py-3">Username / Email</th>
              <th className="px-4 py-3">Nama Pengawas</th>
              <th className="px-4 py-3">Ruang Tugas Default</th>
              <th className="px-4 py-3">Fakultas</th>
              <th className="px-4 py-3">Status Login</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {proctors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-stone-500">
                  Belum ada pengawas ujian terdaftar.
                </td>
              </tr>
            ) : (
              proctors.map((p) => (
                <tr key={p.email} className="hover:bg-[#FAF7F2]/60">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-stone-900">
                    {formatAuthIdentifier(p.email)}
                  </td>
                  <td className="px-4 py-3 text-stone-800">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-700">
                    {p.assigned_room || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-600">{p.faculty || 'Semua'}</td>
                  <td className="px-4 py-3 text-xs">
                    {renderAuthStatusText(authStatusMap[p.email.toLowerCase()])}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPasswordTarget({ email: p.email, name: p.name })}
                        className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
                      >
                        <KeyRound className="h-3 w-3 text-[#EA6113]" />
                        Atur Sandi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.email)}
                        className="rounded border border-stone-200 p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SetPasswordModal
        target={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onSaved={onRefresh}
        onNotify={onNotify}
      />
    </div>
  );
}
