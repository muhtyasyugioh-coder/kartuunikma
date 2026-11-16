import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import type { BrandingConfig, CardPrintStatus, Student } from '../../types.ts';
import { apiFetch } from '../../lib/supabaseClient.ts';
import {
  exportRowsToCsv,
  formatDateTimeId,
  getStudentPrintStatus,
  resolveFacultyForMajor,
} from '../../lib/defaults.ts';
import { downloadStudentExcelTemplate, parseStudentExcelFile } from '../../lib/excel.ts';
import { ConfirmDialog } from '../ConfirmDialog.tsx';

interface AdminStudentsTabProps {
  students: Student[];
  branding: BrandingConfig;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const EMPTY_FORM: Partial<Student> = {
  nim: '',
  name: '',
  faculty: '',
  major: '',
  class_name: '',
  campus: '',
  batch: '',
  student_type: 'Reguler',
  can_print: true,
};

export function AdminStudentsTab({
  students,
  branding,
  onRefresh,
  onNotify,
}: AdminStudentsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CardPrintStatus>('ALL');
  const [facultyFilter, setFacultyFilter] = useState<string>('ALL');
  const [pageSize, setPageSize] = useState<10 | 25 | 50 | 'ALL'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingNim, setEditingNim] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Student>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    destructive?: boolean;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => {
    const total = students.length;
    const printable = students.filter((s) => s.can_print).length;
    const downloaded = students.filter((s) => Boolean(s.last_downloaded_at)).length;
    const blocked = total - printable;
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
    return {
      total,
      printable,
      printablePct: pct(printable),
      downloaded,
      downloadedPct: pct(downloaded),
      blocked,
      blockedPct: pct(blocked),
    };
  }, [students]);

  const facultyOptions = useMemo(() => {
    const fromBranding = branding.faculties.map((f) => f.name);
    const fromStudents = students.map((s) => s.faculty).filter(Boolean);
    return Array.from(new Set([...fromBranding, ...fromStudents]));
  }, [branding.faculties, students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.nim.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) {
        return false;
      }
      if (facultyFilter !== 'ALL' && s.faculty !== facultyFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && getStudentPrintStatus(s) !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [students, search, facultyFilter, statusFilter]);

  const totalItems = filtered.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalItems === 0 || pageSize === 'ALL' ? 0 : (safePage - 1) * pageSize;
  const endIndex =
    totalItems === 0
      ? 0
      : pageSize === 'ALL'
        ? totalItems
        : Math.min(startIndex + pageSize, totalItems);

  const paginatedStudents = useMemo(() => {
    if (pageSize === 'ALL') return filtered;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, pageSize, startIndex, endIndex]);

  const openAddModal = () => {
    setEditingNim(null);
    const defaultMajor = branding.majors[0] || '';
    const resolvedFac = resolveFacultyForMajor(defaultMajor, branding.faculties);
    setForm({
      nim: '',
      name: '',
      faculty: resolvedFac?.name || branding.faculties[0]?.name || '',
      major: defaultMajor,
      class_name: branding.classes[0] || '',
      campus: branding.campus_name,
      batch: branding.batches[branding.batches.length - 1] || '',
      student_type: 'Reguler',
      can_print: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (s: Student) => {
    setEditingNim(s.nim);
    setForm({ ...s });
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nim?.trim() || !form.name?.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      await onRefresh();
      onNotify(editingNim ? 'Data mahasiswa diperbarui.' : 'Mahasiswa baru ditambahkan.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan mahasiswa.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCanPrint = async (s: Student) => {
    try {
      await apiFetch(`/api/admin/students/${encodeURIComponent(s.nim)}`, {
        method: 'PUT',
        body: JSON.stringify({ can_print: !s.can_print }),
      });
      await onRefresh();
      onNotify(
        !s.can_print
          ? `Akses cetak ${s.nim} dibuka.`
          : `Akses cetak ${s.nim} diblokir.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status cetak.');
    }
  };

  const handleResetDownloadSingle = async (s: Student) => {
    try {
      await apiFetch(`/api/admin/students/${encodeURIComponent(s.nim)}`, {
        method: 'PUT',
        body: JSON.stringify({ last_downloaded_at: null }),
      });
      await onRefresh();
      onNotify(`Status unduhan ${s.nim} direset.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mereset status unduhan.');
    }
  };

  const handleExcelImport = async (file: File) => {
    try {
      const parsed = await parseStudentExcelFile(file);
      if (parsed.length === 0) {
        onNotify('File Excel kosong atau format kolom NIM & Nama tidak sesuai template.');
        return;
      }
      const res = await apiFetch<{ importedCount: number }>('/api/admin/students/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ students: parsed }),
      });
      await onRefresh();
      onNotify(`${res.importedCount} data mahasiswa berhasil diimpor dari Excel.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengimpor file Excel.');
    }
  };

  const runBulkAction = (
    actionName: 'unblock_all' | 'block_all' | 'reset_downloads' | 'delete_all',
    title: string,
    description: string,
    destructive = false
  ) => {
    setConfirmState({
      open: true,
      title,
      description,
      destructive,
      action: async () => {
        await apiFetch('/api/admin/students/bulk-action', {
          method: 'POST',
          body: JSON.stringify({ action: actionName }),
        });
        await onRefresh();
        onNotify('Aksi massal berhasil dijalankan.');
      },
    });
  };

  const handleExportCsv = () => {
    exportRowsToCsv(
      'Data_Mahasiswa_Kartu_Ujian.csv',
      ['NIM', 'Nama', 'Fakultas', 'Prodi', 'Kelas', 'Angkatan', 'Jenis', 'Kampus', 'Status Cetak', 'Terakhir Unduh'],
      filtered.map((s) => [
        s.nim,
        s.name,
        s.faculty,
        s.major,
        s.class_name,
        s.batch,
        s.student_type,
        s.campus,
        getStudentPrintStatus(s),
        s.last_downloaded_at ? formatDateTimeId(s.last_downloaded_at) : '',
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip with Percentages */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Total Mahasiswa</p>
          <p className="mt-1 font-mono text-2xl font-bold text-stone-900 tabular-nums">
            {stats.total}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Terdaftar di sistem</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Izin Cetak Aktif</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.printable}{' '}
            <span className="text-sm font-medium text-stone-500">({stats.printablePct}%)</span>
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Memenuhi syarat cetak</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Sudah Unduh Kartu</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#C24908] tabular-nums">
            {stats.downloaded}{' '}
            <span className="text-sm font-medium text-stone-500">({stats.downloadedPct}%)</span>
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Kartu PDF / cetak tercatat</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Akses Diblokir</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
            {stats.blocked}{' '}
            <span className="text-sm font-medium text-stone-500">({stats.blockedPct}%)</span>
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Ditangguhkan sementara</p>
        </div>
      </div>

      {/* Action & Filter Toolbar */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Mahasiswa
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExcelImport(file);
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5 text-[#EA6113]" />
              Import Excel
            </button>

            <button
              type="button"
              onClick={downloadStudentExcelTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#EA6113]" />
              Template Excel
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-[#EA6113]" />
              Export CSV
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                runBulkAction(
                  'unblock_all',
                  'Buka Blokir Semua Mahasiswa?',
                  'Seluruh mahasiswa di database akan diizinkan mencetak kartu ujian.'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
            >
              <Unlock className="h-3.5 w-3.5" />
              Buka Blokir Semua
            </button>
            <button
              type="button"
              onClick={() =>
                runBulkAction(
                  'block_all',
                  'Blokir Semua Mahasiswa?',
                  'Seluruh mahasiswa sementara tidak dapat mencetak kartu ujian hingga dibuka kembali.',
                  true
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#F88F22]/50 bg-[#FFE3B3]/45 px-3 py-2 text-xs font-semibold text-[#C24908] hover:bg-[#FFE3B3]/75 whitespace-nowrap"
            >
              <Lock className="h-3.5 w-3.5" />
              Blokir Semua
            </button>
            <button
              type="button"
              onClick={() =>
                runBulkAction(
                  'reset_downloads',
                  'Reset Semua Status Unduhan?',
                  'Kolom waktu unduh terakhir seluruh mahasiswa akan dikosongkan menjadi Siap Cetak.'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-[#FAF7F2] whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Download
            </button>
            <button
              type="button"
              onClick={() =>
                runBulkAction(
                  'delete_all',
                  'Hapus Seluruh Data Mahasiswa?',
                  'Tindakan ini akan menghapus semua baris pada tabel mahasiswa secara permanen.',
                  true
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus Semua
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari NIM atau nama mahasiswa..."
              className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
            />
          </div>

          <select
            value={facultyFilter}
            onChange={(e) => {
              setFacultyFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            <option value="ALL">Semua Fakultas</option>
            {facultyOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | CardPrintStatus);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            <option value="ALL">Semua Status Cetak</option>
            <option value="Siap Cetak">Siap Cetak</option>
            <option value="Sudah Cetak">Sudah Cetak</option>
            <option value="Diblokir">Diblokir</option>
          </select>

          <select
            aria-label="Jumlah data tampil per halaman"
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value;
              setPageSize(val === 'ALL' ? 'ALL' : (Number(val) as 10 | 25 | 50));
              setCurrentPage(1);
            }}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            <option value={10}>Tampilkan: 10 data</option>
            <option value={25}>Tampilkan: 25 data</option>
            <option value={50}>Tampilkan: 50 data</option>
            <option value="ALL">Tampilkan: All (Semua)</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#FAF7F2] text-xs font-semibold text-stone-600">
                <th className="px-4 py-3">NIM</th>
                <th className="px-4 py-3">Nama Mahasiswa</th>
                <th className="px-4 py-3">Prodi & Fakultas</th>
                <th className="px-4 py-3">Kelas / Angkatan</th>
                <th className="px-4 py-3">Status Kartu</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-stone-500">
                    Belum ada data mahasiswa yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s) => {
                  const status = getStudentPrintStatus(s);
                  return (
                    <tr key={s.nim} className="hover:bg-[#FAF7F2]/70">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-stone-900 tabular-nums">
                        {s.nim}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-stone-900">{s.name}</div>
                        <div className="text-[11px] text-stone-500">{s.student_type}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="font-medium text-stone-800">{s.major || '—'}</div>
                        <div className="text-stone-500">{s.faculty || '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-700 tabular-nums">
                        {s.class_name || '—'} · {s.batch || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {status === 'Siap Cetak' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Siap Cetak
                          </span>
                        )}
                        {status === 'Sudah Cetak' && (
                          <div>
                            <span className="font-semibold text-[#C24908]">Sudah Cetak</span>
                            <div className="font-mono text-[10px] text-stone-500 tabular-nums">
                              {formatDateTimeId(s.last_downloaded_at)}
                            </div>
                          </div>
                        )}
                        {status === 'Diblokir' && (
                          <span className="font-semibold text-red-700">Diblokir</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCanPrint(s)}
                            title={s.can_print ? 'Blokir akses cetak' : 'Buka blokir cetak'}
                            className="rounded border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
                          >
                            {s.can_print ? 'Blokir' : 'Buka'}
                          </button>
                          {s.last_downloaded_at && (
                            <button
                              type="button"
                              onClick={() => handleResetDownloadSingle(s)}
                              title="Reset status unduhan"
                              className="rounded border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-[#FAF7F2]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            title="Edit mahasiswa"
                            className="rounded border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-[#FAF7F2]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: `Hapus Mahasiswa ${s.nim}?`,
                                description: `Data mahasiswa atas nama ${s.name} akan dihapus permanen.`,
                                destructive: true,
                                action: async () => {
                                  await apiFetch(`/api/admin/students/${encodeURIComponent(s.nim)}`, {
                                    method: 'DELETE',
                                  });
                                  await onRefresh();
                                  onNotify(`Mahasiswa ${s.nim} dihapus.`);
                                },
                              })
                            }
                            title="Hapus mahasiswa"
                            className="rounded border border-stone-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-[#FAF7F2] px-4 py-3 text-xs text-stone-600">
          <div className="tabular-nums">
            {totalItems === 0 ? (
              <span>Menampilkan 0 dari 0 mahasiswa</span>
            ) : (
              <span>
                Menampilkan{' '}
                <span className="font-semibold text-stone-900">
                  {startIndex + 1}–{endIndex}
                </span>{' '}
                dari <span className="font-semibold text-stone-900">{totalItems}</span> mahasiswa
              </span>
            )}
          </div>

          {pageSize !== 'ALL' && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Sebelumnya
              </button>
              <span className="px-1 font-mono text-xs font-semibold text-stone-800 tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Berikutnya
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="font-academic text-lg font-semibold text-stone-900">
                {editingNim ? `Edit Mahasiswa (${editingNim})` : 'Tambah Mahasiswa Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">NIM *</label>
                  <input
                    required
                    disabled={Boolean(editingNim)}
                    value={form.nim || ''}
                    onChange={(e) => setForm({ ...form, nim: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none disabled:bg-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Jenis Program</label>
                  <select
                    value={form.student_type || 'Reguler'}
                    onChange={(e) => setForm({ ...form, student_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="Reguler">Reguler</option>
                    <option value="Karyawan">Karyawan</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Nama Lengkap *</label>
                <input
                  required
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Fakultas</label>
                  <select
                    value={form.faculty || ''}
                    onChange={(e) => setForm({ ...form, faculty: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="">Pilih Fakultas</option>
                    {branding.faculties.map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Program Studi</label>
                  <select
                    value={form.major || ''}
                    onChange={(e) => {
                      const nextMajor = e.target.value;
                      const matchedFac = resolveFacultyForMajor(nextMajor, branding.faculties);
                      setForm({
                        ...form,
                        major: nextMajor,
                        faculty: matchedFac ? matchedFac.name : form.faculty,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="">Pilih Prodi</option>
                    {branding.majors.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Kelas</label>
                  <select
                    value={form.class_name || ''}
                    onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="">Pilih Kelas</option>
                    {branding.classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Angkatan</label>
                  <select
                    value={form.batch || ''}
                    onChange={(e) => setForm({ ...form, batch: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="">Pilih Angkatan</option>
                    {branding.batches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Kampus</label>
                  <input
                    value={form.campus || ''}
                    onChange={(e) => setForm({ ...form, campus: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.can_print)}
                  onChange={(e) => setForm({ ...form, can_print: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 accent-[#EA6113]"
                />
                Izinkan Mahasiswa Mencetak Kartu Ujian
              </label>

              <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-[#FAF7F2]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          destructive={confirmState.destructive}
          loading={confirmLoading}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            setConfirmLoading(true);
            try {
              await confirmState.action();
              setConfirmState(null);
            } catch (err) {
              onNotify(err instanceof Error ? err.message : 'Gagal menjalankan aksi pada data mahasiswa.');
              setConfirmState(null);
            } finally {
              setConfirmLoading(false);
            }
          }}
        />
      )}
    </div>
  );
}
