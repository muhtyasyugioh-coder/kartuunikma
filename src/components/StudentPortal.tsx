import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FlaskConical,
  ImagePlus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BrandingConfig,
  ExamSchedule,
  ExamType,
  SimulationPayload,
  Student,
} from '../types.ts';
import { formatDateTimeId, getStudentPrintStatus } from '../lib/defaults.ts';
import { ExamCardPreview } from './ExamCardPreview.tsx';

interface StudentPortalProps {
  branding: BrandingConfig;
  supabaseConfigured: boolean;
  onOpenSetupGuide: () => void;
}

export function StudentPortal({
  branding,
  supabaseConfigured,
  onOpenSetupGuide,
}: StudentPortalProps) {
  const [nimInput, setNimInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [isSimulation, setIsSimulation] = useState(false);
  const [simBlocked, setSimBlocked] = useState(false);

  const [examType, setExamType] = useState<ExamType>('UTS');
  const [selectedBatch, setSelectedBatch] = useState(
    branding.batches[branding.batches.length - 1] || '2024'
  );
  const [selectedClass, setSelectedClass] = useState(branding.classes[0] || 'TI-A');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState(
    branding.academic_years[branding.academic_years.length - 1] || '2026/2027 Ganjil'
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync defaults when branding updates
  useEffect(() => {
    if (!student && branding.academic_years.length > 0) {
      setSelectedAcademicYear((prev) =>
        branding.academic_years.includes(prev)
          ? prev
          : branding.academic_years[branding.academic_years.length - 1]
      );
    }
  }, [branding, student]);

  // Debounced real-time NIM lookup
  useEffect(() => {
    const trimmed = nimInput.trim();
    if (!trimmed) {
      if (!isSimulation) {
        setStudent(null);
        setSchedule(null);
        setLookupError(null);
      }
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSimulation(false);
      setLookupLoading(true);
      setLookupError(null);
      try {
        const res = await fetch(`/api/student/lookup?nim=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (!res.ok) {
          setStudent(null);
          setSchedule(null);
          setLookupError(data.error || 'NIM tidak ditemukan.');
          return;
        }
        const found = data.student as Student;
        setStudent(found);
        if (found.batch) setSelectedBatch(found.batch);
        if (found.class_name) setSelectedClass(found.class_name);
      } catch {
        setLookupError('Gagal memeriksa NIM ke server.');
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [nimInput, isSimulation]);

  // Fetch class schedule whenever class, batch, or academic year changes
  useEffect(() => {
    if (!student || isSimulation) return;
    if (!selectedClass || !selectedBatch || !selectedAcademicYear) return;

    let active = true;
    const params = new URLSearchParams({
      classId: selectedClass,
      batchId: selectedBatch,
      academicYear: selectedAcademicYear,
    });

    fetch(`/api/student/schedule?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSchedule(data.schedule || null);
      })
      .catch(() => {
        if (active) setSchedule(null);
      });

    return () => {
      active = false;
    };
  }, [student, selectedClass, selectedBatch, selectedAcademicYear, isSimulation]);

  const runSimulation = useCallback(
    async (blockedFlag: boolean) => {
      setLookupLoading(true);
      setLookupError(null);
      setActionNotice(null);
      try {
        const res = await fetch('/api/student/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examType, blocked: blockedFlag }),
        });
        if (!res.ok) throw new Error('Simulasi gagal dimuat');
        const payload = (await res.json()) as SimulationPayload;
        setNimInput('');
        setIsSimulation(true);
        setSimBlocked(blockedFlag);
        setStudent(payload.student);
        setSchedule(payload.schedule);
        setSelectedBatch(payload.student.batch);
        setSelectedClass(payload.student.class_name);
        setSelectedAcademicYear(payload.schedule.academic_year);
      } catch {
        setLookupError('Gagal mengaktifkan Mode Simulasi.');
      } finally {
        setLookupLoading(false);
      }
    },
    [examType]
  );

  const exitSimulation = () => {
    setIsSimulation(false);
    setSimBlocked(false);
    setStudent(null);
    setSchedule(null);
    setActionNotice(null);
  };

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setActionNotice('Pilih berkas gambar (JPG/PNG) untuk Pas Foto 3x4.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null);
      setActionNotice(null);
    };
    reader.readAsDataURL(file);
  };

  const recordDownload = async () => {
    if (!student || !student.can_print) return;
    try {
      const res = await fetch('/api/student/downloaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nim: student.nim, isSimulation }),
      });
      if (res.ok) {
        const data = await res.json();
        setStudent((prev) =>
          prev ? { ...prev, last_downloaded_at: data.last_downloaded_at } : prev
        );
      }
    } catch {
      // Non-blocking audit update
    }
  };

  const handleDownloadPdf = async () => {
    if (!student || !student.can_print || !cardRef.current) return;
    setExportingPdf(true);
    setActionNotice(null);
    try {
      const hasInaccessibleStyleSheet = Array.from(document.styleSheets).some((sheet) => {
        try {
          void sheet.cssRules;
          return false;
        } catch {
          return true;
        }
      });

      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2.2,
        backgroundColor: '#FFFFFF',
        skipFonts: hasInaccessibleStyleSheet,
      });
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      pdf.save(`Kartu_Ujian_${examType}_${student.nim}.pdf`);
      await recordDownload();
      setActionNotice(
        isSimulation
          ? 'PDF simulasi berhasil diunduh.'
          : 'Kartu Ujian PDF berhasil diunduh dan status unduhan tercatat.'
      );
    } catch (err) {
      console.error('PDF export error:', err);
      setActionNotice('Gagal membuat file PDF. Gunakan tombol Cetak Langsung (Ctrl+P) sebagai alternatif.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintDirect = async () => {
    if (!student || !student.can_print) return;
    await recordDownload();
    window.print();
  };

  const printStatus = student ? getStudentPrintStatus(student) : null;

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header Intro + Connection Info (No-Print) */}
      <div className="mb-6 flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between no-print">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#EA6113] uppercase">
            Layanan Mandiri Mahasiswa
          </p>
          <h1 className="mt-1 font-academic text-2xl font-semibold tracking-tight text-stone-900 sm:text-4xl text-balance">
            Cetak Kartu Peserta Ujian (UTS & UAS)
          </h1>
          <p className="mt-1.5 text-sm text-stone-600">
            Masukkan NIM Anda untuk memverifikasi kelayakan cetak, memeriksa jadwal ujian kelas, dan mengunduh kartu resmi A4.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!supabaseConfigured && (
            <button
              type="button"
              onClick={onOpenSetupGuide}
              className="rounded-lg border border-[#F88F22] bg-[#FFE3B3]/60 px-3.5 py-2 text-xs font-semibold text-stone-900 hover:bg-[#FFE3B3] whitespace-nowrap shrink-0"
            >
              Konfigurasi Supabase
            </button>
          )}
          {!isSimulation ? (
            <button
              type="button"
              onClick={() => runSimulation(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 whitespace-nowrap shrink-0"
            >
              <FlaskConical className="h-4 w-4 text-[#EA6113]" />
              Mode Simulasi
            </button>
          ) : (
            <button
              type="button"
              onClick={exitSimulation}
              className="inline-flex items-center gap-2 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white hover:bg-[#D1520B] whitespace-nowrap shrink-0"
            >
              <X className="h-4 w-4" />
              Keluar Simulasi
            </button>
          )}
        </div>
      </div>

      {/* Simulation Mode Toolbar */}
      {isSimulation && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#F88F22]/50 bg-[#FFE3B3]/45 px-4 py-3.5 text-sm text-stone-900 sm:flex-row sm:items-center sm:justify-between no-print">
          <div className="flex items-start gap-2.5">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#EA6113]" />
            <div>
              <span className="font-semibold">Mode Simulasi Aktif</span>
              <span className="mx-1.5 text-[#EA6113]">·</span>
              <span className="text-stone-700">
                Menampilkan pratinjau kartu contoh dari server tanpa mengubah database produksi.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#F88F22]/40 bg-white p-1 shrink-0">
            <button
              type="button"
              onClick={() => runSimulation(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                !simBlocked
                  ? 'bg-[#EA6113] text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Simulasi Siap Cetak
            </button>
            <button
              type="button"
              onClick={() => runSimulation(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                simBlocked
                  ? 'bg-red-600 text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Simulasi Diblokir
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* LEFT COLUMN: Controls (No-Print) */}
        <aside className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 lg:col-span-4 no-print">
          {/* NIM Input */}
          <div>
            <label
              htmlFor="nim-search-input"
              className="block text-xs font-semibold tracking-wide text-stone-700 uppercase"
            >
              Nomor Induk Mahasiswa (NIM)
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#EA6113]" />
              <input
                id="nim-search-input"
                type="text"
                value={nimInput}
                onChange={(e) => setNimInput(e.target.value)}
                placeholder="Contoh: 202401001"
                className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pr-10 pl-10 font-mono text-sm text-stone-900 placeholder:font-sans placeholder:text-stone-400 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
              />
              {nimInput && (
                <button
                  type="button"
                  onClick={() => setNimInput('')}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700"
                  aria-label="Hapus NIM"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {lookupLoading && (
              <p className="mt-2 text-xs text-stone-500">Mencari data mahasiswa...</p>
            )}
            {lookupError && (
              <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{lookupError}</span>
              </div>
            )}
          </div>

          {/* Detected Student Summary & Print Status */}
          {student && (
            <div className="rounded-lg border border-[#F88F22]/45 bg-[#FFE3B3]/30 p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-academic text-base font-semibold text-stone-900">
                    {student.name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-stone-600 tabular-nums">
                    {student.nim} · {student.major}
                  </p>
                </div>
              </div>

              <div className="border-t border-[#F88F22]/30 pt-2.5 text-xs">
                {printStatus === 'Siap Cetak' && (
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Siap Cetak</span>
                  </div>
                )}
                {printStatus === 'Sudah Cetak' && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-[#C24908]">
                      <FileCheck2 className="h-4 w-4 shrink-0" />
                      <span>Sudah Cetak</span>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] text-stone-600 tabular-nums">
                      <Clock className="h-3 w-3 text-[#EA6113]" />
                      Terakhir diunduh: {formatDateTimeId(student.last_downloaded_at)}
                    </p>
                  </div>
                )}
                {printStatus === 'Diblokir' && (
                  <div className="flex items-center gap-1.5 font-semibold text-red-700">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Diblokir (Hubungi Administrasi)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Exam Type Segmented Control */}
          <div>
            <span className="block text-xs font-semibold tracking-wide text-stone-700 uppercase">
              Jenis Ujian
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
              {(['UTS', 'UAS'] as ExamType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setExamType(type)}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    examType === type
                      ? 'bg-white text-[#EA6113] shadow-xs ring-1 ring-[#F88F22]/40'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {type === 'UTS' ? 'UTS (Tengah Semester)' : 'UAS (Akhir Semester)'}
                </button>
              ))}
            </div>
          </div>

          {/* Academic Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="batch-select"
                className="block text-xs font-semibold text-stone-700"
              >
                Angkatan
              </label>
              <select
                id="batch-select"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
              >
                {Array.from(new Set([...branding.batches, selectedBatch].filter(Boolean))).map(
                  (b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="class-select"
                className="block text-xs font-semibold text-stone-700"
              >
                Kelas
              </label>
              <select
                id="class-select"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
              >
                {Array.from(new Set([...branding.classes, selectedClass].filter(Boolean))).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="academic-year-select"
              className="block text-xs font-semibold text-stone-700"
            >
              Tahun Akademik
            </label>
            <select
              id="academic-year-select"
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none"
            >
              {Array.from(
                new Set([...branding.academic_years, selectedAcademicYear].filter(Boolean))
              ).map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </div>

          {/* Local 3x4 Photo Upload */}
          <div>
            <span className="block text-xs font-semibold text-stone-700">
              Pas Foto 3x4 (Opsional · Lokal di Browser)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-[#F88F22]/70 bg-[#FFE3B3]/20 px-3 py-2.5 text-xs font-medium text-stone-800 hover:border-[#EA6113] hover:bg-[#FFE3B3]/40"
              >
                <ImagePlus className="h-4 w-4 text-[#EA6113]" />
                {photoDataUrl ? 'Ganti Pas Foto' : 'Unggah Pas Foto 3x4'}
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(null)}
                  className="inline-flex items-center justify-center rounded-lg border border-stone-200 p-2.5 text-stone-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Hapus pas foto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Print / PDF Actions */}
          <div className="space-y-2.5 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!student || !student.can_print || exportingPdf}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EA6113] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#D1520B] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Download className="h-4 w-4" />
              {exportingPdf ? 'Menyiapkan PDF A4...' : 'Simpan Kartu (PDF)'}
            </button>

            <button
              type="button"
              onClick={handlePrintDirect}
              disabled={!student || !student.can_print}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4 text-[#EA6113]" />
              Cetak Langsung (Ctrl+P)
            </button>

            {actionNotice && (
              <p className="text-xs font-medium text-stone-600">{actionNotice}</p>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: A4 Exam Card Preview */}
        <section className="lg:col-span-8 print-reset">
          {student ? (
            <ExamCardPreview
              cardRef={cardRef}
              student={student}
              schedule={schedule}
              branding={branding}
              examType={examType}
              academicYear={selectedAcademicYear}
              selectedBatch={selectedBatch}
              selectedClass={selectedClass}
              photoDataUrl={photoDataUrl}
              isSimulation={isSimulation}
            />
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-xl border border-dashed border-[#F88F22]/50 bg-white p-8 text-center no-print">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#F88F22]/40 bg-[#FFE3B3]/45 text-[#EA6113]">
                <Search className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-academic text-xl font-semibold text-stone-900">
                Pratinjau Kartu Ujian A4
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-stone-500">
                Ketik NIM Anda pada kolom pencarian di sebelah kiri untuk menampilkan Kartu Peserta Ujian lengkap dengan QR Code verifikasi dan jadwal mata kuliah.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => runSimulation(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#F88F22]/60 bg-[#FFE3B3]/35 px-4 py-2 text-xs font-semibold text-stone-900 hover:bg-[#FFE3B3]/65"
                >
                  <FlaskConical className="h-4 w-4 text-[#EA6113]" />
                  Coba Mode Simulasi
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
