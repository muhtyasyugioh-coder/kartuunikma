import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  AttendanceStatus,
  AuthMeResponse,
  BrandingConfig,
  ExamAttendance,
  ExamSchedule,
  ExamType,
  Student,
} from '../types.ts';
import { apiFetch } from '../lib/supabaseClient.ts';
import { exportRowsToCsv, formatDateTimeId } from '../lib/defaults.ts';
import { QrScannerPanel } from './QrScannerPanel.tsx';
import { EmailAuthForm } from './LoginModal.tsx';

interface ProctorPortalProps {
  auth: AuthMeResponse;
  branding: BrandingConfig;
  supabaseConfigured: boolean;
  onAuthSuccess: () => Promise<void>;
  onOpenSetupGuide: () => void;
  onOpenAdmin?: () => void;
}

interface VerificationResult {
  valid: boolean;
  isBlocked: boolean;
  examTypeMismatch: boolean;
  scannedExamType: ExamType | null;
  isFormattedQr: boolean;
  student: Student;
  schedule: ExamSchedule | null;
  matchedSubject: {
    code: string;
    subject: string;
    room: string;
    time: string;
  } | null;
}

export function ProctorPortal({
  auth,
  branding,
  supabaseConfigured,
  onAuthSuccess,
  onOpenSetupGuide,
  onOpenAdmin,
}: ProctorPortalProps) {
  const [examType, setExamType] = useState<ExamType>('UTS');
  const [academicYear, setAcademicYear] = useState(
    branding.academic_years[branding.academic_years.length - 1] || '2026/2027 Ganjil'
  );
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>(
    branding.subjects[0]?.code || 'IF301'
  );
  const [selectedRoom, setSelectedRoom] = useState<string>(
    auth.proctorInfo?.assigned_room || 'ALL'
  );

  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceList, setAttendanceList] = useState<ExamAttendance[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [manualInput, setManualInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [proctorNote, setProctorNote] = useState('');
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus | 'Belum Absen'>('ALL');

  const activeSubjectObj = useMemo(() => {
    return (
      branding.subjects.find((s) => s.code === selectedSubjectCode) || {
        code: selectedSubjectCode,
        name: selectedSubjectCode,
        sks: 3,
      }
    );
  }, [branding.subjects, selectedSubjectCode]);

  useEffect(() => {
    if (auth.proctorInfo?.assigned_room) {
      setSelectedRoom(auth.proctorInfo.assigned_room);
    }
  }, [auth.proctorInfo?.assigned_room]);

  const loadSessionData = useCallback(async () => {
    if (!auth.authenticated || !auth.isProctor) return;
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        examType,
        academicYear,
        className: selectedClass,
        subjectCode: selectedSubjectCode,
        room: selectedRoom,
      });
      const res = await apiFetch<{
        students: Student[];
        attendance: ExamAttendance[];
      }>(`/api/proctor/session-data?${params.toString()}`);
      setStudents(res.students || []);
      setAttendanceList(res.attendance || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data sesi ujian.');
    } finally {
      setLoadingData(false);
    }
  }, [
    auth.authenticated,
    auth.isProctor,
    examType,
    academicYear,
    selectedClass,
    selectedSubjectCode,
    selectedRoom,
  ]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  const handleVerifyCode = useCallback(
    async (rawCode: string) => {
      const trimmed = rawCode.trim();
      if (!trimmed) return;
      setVerifying(true);
      setVerifyError(null);
      try {
        const res = await apiFetch<VerificationResult>('/api/proctor/verify-card', {
          method: 'POST',
          body: JSON.stringify({
            code: trimmed,
            examType,
            academicYear,
            subjectCode: selectedSubjectCode,
          }),
        });
        setVerifyResult(res);
        setManualInput(trimmed);
        // Load existing note if already recorded
        const existing = attendanceList.find((a) => a.nim === res.student.nim);
        setProctorNote(existing?.note || '');
      } catch (err) {
        setVerifyResult(null);
        setVerifyError(err instanceof Error ? err.message : 'Verifikasi kartu gagal.');
      } finally {
        setVerifying(false);
      }
    },
    [examType, academicYear, selectedSubjectCode, attendanceList]
  );

  const recordAttendance = async (
    targetStudent: Student,
    status: AttendanceStatus,
    noteText: string,
    cardVerified: boolean
  ) => {
    setSavingAttendance(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ attendance: ExamAttendance }>('/api/proctor/attendance', {
        method: 'POST',
        body: JSON.stringify({
          nim: targetStudent.nim,
          student_name: targetStudent.name,
          major: targetStudent.major,
          class_name: targetStudent.class_name,
          batch: targetStudent.batch,
          exam_type: examType,
          academic_year: academicYear,
          subject_code: activeSubjectObj.code,
          subject_name: activeSubjectObj.name,
          room: selectedRoom === 'ALL' ? '' : selectedRoom,
          status,
          card_verified: cardVerified,
          note: noteText,
        }),
      });
      setAttendanceList((prev) => {
        const idx = prev.findIndex((a) => a.id === res.attendance.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = res.attendance;
          return copy;
        }
        return [res.attendance, ...prev];
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan presensi.');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Auth Gate Screens
  if (!auth.authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xs">
          <EmailAuthForm
            title="Masuk Pengawas Ujian"
            subtitle="Masuk menggunakan username atau email dan kata sandi yang terdaftar di daftar Pengawas Ujian atau Admin."
            supabaseConfigured={supabaseConfigured}
            onSuccess={onAuthSuccess}
            onOpenSetupGuide={onOpenSetupGuide}
          />
        </div>
      </div>
    );
  }

  if (!auth.isProctor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="font-academic mt-3 text-xl font-semibold text-stone-900">
            Akses Pengawas Ditolak
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Akun <span className="font-mono font-semibold">{auth.email}</span> belum terdaftar pada tabel pengawas ujian (<code className="font-mono text-xs">proctors</code>) maupun admin.
          </p>
        </div>
      </div>
    );
  }

  // Merge students with attendance map
  const attendanceByNim = new Map<string, ExamAttendance>();
  for (const rec of attendanceList) {
    attendanceByNim.set(rec.nim, rec);
  }

  const combinedRows = students.map((s) => ({
    student: s,
    attendance: attendanceByNim.get(s.nim) || null,
  }));

  const stats = {
    total: students.length,
    hadir: combinedRows.filter((r) => r.attendance?.status === 'Hadir').length,
    izinOrAbsent: combinedRows.filter(
      (r) => r.attendance?.status === 'Izin' || r.attendance?.status === 'Tidak Hadir'
    ).length,
    blocked: students.filter((s) => !s.can_print).length,
  };

  const filteredRows = combinedRows.filter(({ student: s, attendance }) => {
    const q = tableSearch.trim().toLowerCase();
    const matchText =
      !q || s.nim.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    if (!matchText) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'Belum Absen') return !attendance;
    return attendance?.status === statusFilter;
  });

  const handleExportCsv = () => {
    exportRowsToCsv(
      `Daftar_Hadir_${examType}_${activeSubjectObj.code}.csv`,
      ['NIM', 'Nama', 'Prodi', 'Kelas', 'Angkatan', 'Izin Cetak', 'Status Kehadiran', 'Ruang', 'Catatan', 'Pengawas', 'Waktu Verifikasi'],
      filteredRows.map(({ student: s, attendance }) => [
        s.nim,
        s.name,
        s.major,
        s.class_name,
        s.batch,
        s.can_print ? 'Sah' : 'Diblokir',
        attendance?.status || 'Belum Absen',
        attendance?.room || (selectedRoom === 'ALL' ? '' : selectedRoom),
        attendance?.note || '',
        attendance?.proctor_name || auth.name || '',
        attendance?.verified_at ? formatDateTimeId(attendance.verified_at) : '',
      ])
    );
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between no-print">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#EA6113] uppercase">
            Pengawas Ruang Ujian · {auth.name}
          </p>
          <h1 className="mt-1 font-academic text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            Verifikasi Kartu & Presensi Ujian
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {auth.isAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
            >
              Kembali ke Panel Admin
            </button>
          )}
          <button
            type="button"
            onClick={loadSessionData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#EA6113] ${loadingData ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-[#EA6113]" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#D1520B] whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak Daftar Hadir
          </button>
        </div>
      </div>

      {/* Session Filters (No-Print) */}
      <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 no-print">
        <div>
          <label className="block text-xs font-semibold text-stone-600">Jenis Ujian</label>
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
            {(['UTS', 'UAS'] as ExamType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setExamType(t)}
                className={`rounded-md py-1.5 text-xs font-semibold ${
                  examType === t
                    ? 'bg-white text-[#EA6113] shadow-xs ring-1 ring-[#F88F22]/40'
                    : 'text-stone-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-600">Tahun Akademik</label>
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            {branding.academic_years.map((ay) => (
              <option key={ay} value={ay}>
                {ay}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-600">Kelas</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            <option value="ALL">Semua Kelas</option>
            {branding.classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-600">Mata Kuliah</label>
          <select
            value={selectedSubjectCode}
            onChange={(e) => setSelectedSubjectCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            {branding.subjects.map((subj) => (
              <option key={subj.code} value={subj.code}>
                {subj.code} — {subj.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-600">Ruang Ujian</label>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
          >
            <option value="ALL">Semua Ruang</option>
            {branding.rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 no-print">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Total Peserta</p>
          <p className="mt-1 font-mono text-2xl font-bold text-stone-900 tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Hadir Terverifikasi</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.hadir}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Izin / Tidak Hadir</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#C24908] tabular-nums">
            {stats.izinOrAbsent}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-500">Izin Cetak Diblokir</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
            {stats.blocked}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 no-print">
          {errorMsg}
        </div>
      )}

      {/* Scanner & Verification Split (No-Print) */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12 no-print">
        <div className="space-y-4 lg:col-span-5">
          <QrScannerPanel onScan={(text) => handleVerifyCode(text)} />

          {/* Manual Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyCode(manualInput);
            }}
            className="rounded-xl border border-stone-200 bg-white p-4"
          >
            <label
              htmlFor="manual-qr-nim"
              className="block text-xs font-semibold text-stone-700"
            >
              Input Manual NIM atau Kode QR Kartu
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="manual-qr-nim"
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="NIM atau VERIFIED_KOMPUTAMA_..."
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifying || !manualInput.trim()}
                className="rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white hover:bg-[#D1520B] disabled:opacity-50 whitespace-nowrap"
              >
                {verifying ? 'Memeriksa...' : 'Verifikasi'}
              </button>
            </div>
            {verifyError && (
              <p className="mt-2.5 text-xs font-medium text-red-700">{verifyError}</p>
            )}
          </form>
        </div>

        {/* Verification Result & Quick Attendance */}
        <div className="rounded-xl border border-stone-200 bg-white p-5 lg:col-span-7">
          {!verifyResult ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
              <ShieldCheck className="h-8 w-8 text-[#EA6113]" />
              <p className="font-academic mt-3 text-base font-semibold text-stone-900">
                Hasil Verifikasi Kartu Peserta
              </p>
              <p className="mt-1 max-w-md text-xs text-stone-500">
                Pindai QR Code dari kartu ujian mahasiswa atau masukkan NIM secara manual untuk mengecek keabsahan kartu, status blokir, dan mencatat kehadiran secara cepat.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
                <div>
                  <p className="font-mono text-xs text-stone-500">{verifyResult.student.nim}</p>
                  <h3 className="font-academic text-xl font-semibold text-stone-900">
                    {verifyResult.student.name}
                  </h3>
                  <p className="text-xs text-stone-600">
                    {verifyResult.student.major} · Kelas {verifyResult.student.class_name} · Angkatan{' '}
                    {verifyResult.student.batch}
                  </p>
                </div>

                {verifyResult.isBlocked ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800">
                    <XCircle className="h-4 w-4" />
                    Kartu Diblokir
                  </div>
                ) : verifyResult.examTypeMismatch ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-[#F88F22]/50 bg-[#FFE3B3]/45 px-3 py-1.5 text-xs font-semibold text-[#C24908]">
                    <AlertTriangle className="h-4 w-4" />
                    QR untuk {verifyResult.scannedExamType}, sesi aktif {examType}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Kartu Sah & Terverifikasi
                  </div>
                )}
              </div>

              {/* Schedule check */}
              <div className="rounded-lg border border-stone-200 bg-[#FAF7F2] p-3 text-xs text-stone-700">
                {verifyResult.matchedSubject ? (
                  <p>
                    <span className="font-semibold text-stone-900">Jadwal Terdaftar:</span>{' '}
                    {verifyResult.matchedSubject.code} — {verifyResult.matchedSubject.subject} (
                    {verifyResult.matchedSubject.time}, Ruang {verifyResult.matchedSubject.room})
                  </p>
                ) : (
                  <p className="text-[#C24908]">
                    Mata kuliah <span className="font-mono font-semibold">{activeSubjectObj.code}</span> tidak ditemukan di jadwal kelas {verifyResult.student.class_name} ({academicYear}).
                  </p>
                )}
              </div>

              {/* Proctor Note & Attendance Buttons */}
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Catatan Pengawas (Opsional)
                </label>
                <input
                  type="text"
                  value={proctorNote}
                  onChange={(e) => setProctorNote(e.target.value)}
                  placeholder="Contoh: Terlambat 10 menit / KTM tertinggal / Surat izin sakit"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={savingAttendance}
                  onClick={() =>
                    recordAttendance(
                      verifyResult.student,
                      'Hadir',
                      proctorNote,
                      verifyResult.valid
                    )
                  }
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Catat Hadir
                </button>
                <button
                  type="button"
                  disabled={savingAttendance}
                  onClick={() =>
                    recordAttendance(
                      verifyResult.student,
                      'Izin',
                      proctorNote,
                      verifyResult.valid
                    )
                  }
                  className="rounded-lg border border-[#F88F22]/60 bg-[#FFE3B3]/45 px-4 py-2 text-xs font-semibold text-[#C24908] hover:bg-[#FFE3B3]/75 disabled:opacity-50"
                >
                  Catat Izin
                </button>
                <button
                  type="button"
                  disabled={savingAttendance}
                  onClick={() =>
                    recordAttendance(
                      verifyResult.student,
                      'Tidak Hadir',
                      proctorNote,
                      verifyResult.valid
                    )
                  }
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                >
                  Catat Tidak Hadir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Table (Also Print-Ready for Daftar Hadir!) */}
      <div className="rounded-xl border border-stone-200 bg-white print-reset">
        {/* Print-only header for Attendance Sheet */}
        <div className="hidden print-only mb-4 border-b-2 border-stone-900 pb-3">
          <h2 className="font-academic text-lg font-bold uppercase">{branding.campus_name}</h2>
          <p className="text-sm font-semibold">
            DAFTAR HADIR PESERTA {examType} — TAHUN AKADEMIK {academicYear}
          </p>
          <p className="mt-1 font-mono text-xs">
            Mata Kuliah: {activeSubjectObj.code} - {activeSubjectObj.name} · Kelas: {selectedClass} · Ruang: {selectedRoom}
          </p>
        </div>

        {/* Table Toolbar (No-Print) */}
        <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between no-print">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#EA6113]" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Cari NIM atau nama..."
              className="w-full rounded-lg border border-stone-300 py-1.5 pr-3 pl-9 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-stone-100 p-1">
            {(['ALL', 'Hadir', 'Izin', 'Tidak Hadir', 'Belum Absen'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-[#EA6113] shadow-xs ring-1 ring-[#F88F22]/40'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {st === 'ALL' ? 'Semua' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#FAF7F2] text-xs font-semibold text-stone-600">
                <th className="px-4 py-3">NIM</th>
                <th className="px-4 py-3">Nama Mahasiswa</th>
                <th className="px-4 py-3">Kelas / Prodi</th>
                <th className="px-4 py-3">Izin Kartu</th>
                <th className="px-4 py-3">Status Presensi</th>
                <th className="px-4 py-3">Catatan</th>
                <th className="px-4 py-3 text-right no-print">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-stone-500">
                    Tidak ada peserta yang sesuai dengan filter sesi ujian ini.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ student: s, attendance }) => (
                  <tr key={s.nim} className="hover:bg-[#FAF7F2]/70">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-stone-900 tabular-nums">
                      {s.nim}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-stone-900">{s.name}</td>
                    <td className="px-4 py-2.5 text-xs text-stone-600">
                      <span className="font-mono font-semibold text-stone-800">{s.class_name}</span>
                      {' · '}
                      {s.major}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {s.can_print ? (
                        <span className="font-medium text-emerald-700">Sah</span>
                      ) : (
                        <span className="font-semibold text-red-700">Diblokir</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {attendance ? (
                        <div>
                          <span
                            className={`font-semibold ${
                              attendance.status === 'Hadir'
                                ? 'text-emerald-700'
                                : attendance.status === 'Izin'
                                ? 'text-[#C24908]'
                                : 'text-red-700'
                            }`}
                          >
                            {attendance.status}
                          </span>
                          <p className="font-mono text-[10px] text-stone-400 tabular-nums">
                            {formatDateTimeId(attendance.verified_at)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-stone-400">Belum Absen</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-stone-600">
                      {attendance?.note || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right no-print">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={savingAttendance}
                          onClick={() => recordAttendance(s, 'Hadir', attendance?.note || '', s.can_print)}
                          className="rounded border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Hadir
                        </button>
                        <button
                          type="button"
                          disabled={savingAttendance}
                          onClick={() => recordAttendance(s, 'Izin', attendance?.note || '', s.can_print)}
                          className="rounded border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-[#C24908] hover:bg-[#FFE3B3]/40"
                        >
                          Izin
                        </button>
                        <button
                          type="button"
                          disabled={savingAttendance}
                          onClick={() =>
                            recordAttendance(s, 'Tidak Hadir', attendance?.note || '', s.can_print)
                          }
                          className="rounded border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          Alpa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Print-only proctor signature footer */}
        <div className="hidden print-only mt-8 flex justify-end pr-6 text-xs">
          <div className="text-center">
            <p>Pengawas Ruang Ujian,</p>
            <div className="h-14" />
            <p className="font-bold underline">{auth.name}</p>
            <p className="font-mono text-[11px] text-stone-600">{auth.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
