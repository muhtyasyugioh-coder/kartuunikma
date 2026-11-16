import { useEffect, useState, type RefObject } from 'react';
import QRCode from 'qrcode';
import { ShieldAlert } from 'lucide-react';
import type { BrandingConfig, ExamSchedule, ExamType, Student } from '../types.ts';
import { buildQrPayload, formatScheduleDateId, resolveDeanForStudent } from '../lib/defaults.ts';

interface ExamCardPreviewProps {
  cardRef: RefObject<HTMLDivElement | null>;
  student: Student;
  schedule: ExamSchedule | null;
  branding: BrandingConfig;
  examType: ExamType;
  academicYear: string;
  selectedBatch: string;
  selectedClass: string;
  photoDataUrl: string | null;
  isSimulation?: boolean;
}

export function ExamCardPreview({
  cardRef,
  student,
  schedule,
  branding,
  examType,
  academicYear,
  selectedBatch,
  selectedClass,
  photoDataUrl,
  isSimulation = false,
}: ExamCardPreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [deanQrDataUrl, setDeanQrDataUrl] = useState<string>('');
  const [logoError, setLogoError] = useState(false);

  const qrPayload = buildQrPayload(student.nim, examType);
  const dean = resolveDeanForStudent(student, branding);
  const deanQrPayload = `TTD ELEKTRONIK SAH\n${branding.campus_name}\n${dean.role}\n${dean.name}${dean.nidn ? `\n${dean.nidn}` : ''}\nNIM: ${student.nim} (${examType} ${academicYear})`;
  const items = schedule?.schedules || [];
  const totalSks = items.reduce((acc, item) => acc + (Number(item.sks) || 0), 0);

  useEffect(() => {
    setLogoError(false);
  }, [branding.logo_url]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrPayload, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [qrPayload]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(deanQrPayload, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setDeanQrDataUrl(url);
      })
      .catch(() => {
        if (active) setDeanQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [deanQrPayload]);

  const primaryColor =
    branding.primary_color && branding.primary_color !== '#0F172A'
      ? branding.primary_color
      : '#EA6113';
  const secondaryColor =
    branding.secondary_color && branding.secondary_color !== '#1D4ED8'
      ? branding.secondary_color
      : '#F88F22';
  const todayFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="w-full overflow-x-auto pb-2 print-reset">
      {/* Blocked Overlay Banner (Screen Only) */}
      {!student.can_print && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 no-print">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <p className="font-semibold">Akses Cetak Kartu Ujian Diblokir</p>
            <p className="mt-0.5 text-red-800">
              Status administrasi mahasiswa atas nama <span className="font-medium">{student.name}</span> ({student.nim}) saat ini diblokir. Hubungi Bagian Administrasi Akademik atau Keuangan untuk membuka akses cetak.
            </p>
          </div>
        </div>
      )}

      {/* A4 Sheet Wrapper */}
      <div className="mx-auto w-[794px] max-w-none overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm print-reset">
        <div className="sunset-accent-bar h-1.5 w-full" />
        <div
          ref={cardRef}
          className="a4-sheet relative bg-white px-10 py-8 text-stone-900"
          style={{ width: '794px', minHeight: '1122px' }}
        >
          {/* KOP KAMPUS */}
          <div
            className="flex items-center gap-5 pb-4"
            style={{ borderBottom: `3px solid ${primaryColor}` }}
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-[#FAF7F2] p-1.5">
              {branding.logo_url && !logoError ? (
                <img
                  src={branding.logo_url}
                  alt={`Logo ${branding.campus_name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <svg
                  viewBox="0 0 48 48"
                  className="h-12 w-12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M24 4L6 12v11c0 11.4 7.7 21.4 18 24 10.3-2.6 18-12.6 18-24V12L24 4z"
                    stroke={primaryColor}
                    strokeWidth="2.5"
                    fill="#FFF7EB"
                  />
                  <path
                    d="M15 20l9-4 9 4-9 4-9-4z"
                    fill={secondaryColor}
                  />
                  <path
                    d="M18 23v6c0 2.2 2.7 4 6 4s6-1.8 6-4v-6"
                    stroke={primaryColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    className="font-academic text-2xl font-bold tracking-tight uppercase"
                    style={{ color: primaryColor }}
                  >
                    {branding.campus_name}
                  </h2>
                  <p className="mt-0.5 text-xs text-stone-600">{branding.motto}</p>
                </div>
                {isSimulation && (
                  <span className="shrink-0 border border-[#F88F22] bg-[#FFE3B3]/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-stone-900">
                    MODE SIMULASI
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-stone-500">
                Panitia Pelaksana Ujian Akademik · Sistem Distribusi Kartu Resmi
              </p>
            </div>
          </div>

          <div
            className="mt-0.5 h-px w-full"
            style={{ backgroundColor: secondaryColor }}
          />

          {/* JUDUL KARTU */}
          <div className="mt-5 text-center">
            <h1 className="font-academic text-lg font-bold tracking-wide text-stone-900 uppercase">
              Kartu Peserta {examType === 'UTS' ? 'Ujian Tengah Semester (UTS)' : 'Ujian Akhir Semester (UAS)'}
            </h1>
            <p className="mt-0.5 font-mono text-xs font-medium text-stone-600 tabular-nums">
              Tahun Akademik {academicYear}
            </p>
          </div>

          {/* IDENTITAS MAHASISWA + FOTO + QR CODE */}
          <div className="mt-5 grid grid-cols-12 gap-5 rounded-md border border-stone-300 p-4">
            <div className="col-span-7 space-y-2 text-[12.5px]">
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">NIM</span>
                <span className="col-span-8 font-mono font-bold text-stone-900 tabular-nums">
                  : {student.nim}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Nama Lengkap</span>
                <span className="col-span-8 font-semibold text-stone-900 uppercase">
                  : {student.name}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Fakultas</span>
                <span className="col-span-8 text-stone-800">
                  : {student.faculty || '—'}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Program Studi</span>
                <span className="col-span-8 font-medium text-stone-800">
                  : {student.major || '—'}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Kelas / Angkatan</span>
                <span className="col-span-8 font-mono text-stone-800 tabular-nums">
                  : {selectedClass || student.class_name} / {selectedBatch || student.batch}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Program / Kampus</span>
                <span className="col-span-8 text-stone-800">
                  : {student.student_type || 'Reguler'} · {student.campus || branding.campus_name}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 text-stone-500">Status Kartu</span>
                <span
                  className={`col-span-8 font-semibold ${
                    student.can_print ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  : {student.can_print ? 'SAH / TERVERIFIKASI' : 'DIBLOKIR (TIDAK BERLAKU)'}
                </span>
              </div>
            </div>

            {/* PAS FOTO 3x4 & QR CODE */}
            <div className="col-span-5 flex items-start justify-end gap-3.5">
              <div className="flex flex-col items-center">
                <div className="flex h-[118px] w-[88px] items-center justify-center overflow-hidden rounded border border-stone-300 bg-[#FAF7F2]">
                  {photoDataUrl ? (
                    <img
                      src={photoDataUrl}
                      alt={`Pas Foto ${student.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="px-2 text-center text-[10px] leading-snug font-medium text-stone-400">
                      PAS FOTO
                      <br />
                      3 x 4
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex h-[118px] w-[118px] items-center justify-center rounded border border-stone-300 bg-white p-1.5">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR Verifikasi ${student.nim}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-stone-400">QR...</span>
                  )}
                </div>
                <span className="mt-1 font-mono text-[9px] tracking-tight text-stone-500">
                  {qrPayload}
                </span>
              </div>
            </div>
          </div>

          {/* TABEL JADWAL UJIAN */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wide text-stone-900 uppercase">
                Jadwal Mata Kuliah Ujian
              </h3>
              <span className="font-mono text-[11px] text-stone-600 tabular-nums">
                Total: {items.length} Mata Kuliah · {totalSks} SKS
              </span>
            </div>

            <table className="w-full border-collapse border border-stone-300 text-[11.5px]">
              <thead>
                <tr className="bg-[#FAF7F2] text-left font-semibold text-stone-800">
                  <th className="border border-stone-300 px-2 py-2 text-center w-8">No</th>
                  <th className="border border-stone-300 px-2 py-2 w-16">Kode</th>
                  <th className="border border-stone-300 px-2.5 py-2">Mata Kuliah</th>
                  <th className="border border-stone-300 px-2 py-2 text-center w-10">SKS</th>
                  <th className="border border-stone-300 px-2 py-2 w-28">Hari / Tanggal</th>
                  <th className="border border-stone-300 px-2 py-2 w-24">Waktu</th>
                  <th className="border border-stone-300 px-2 py-2 w-24">Ruang</th>
                  <th className="border border-stone-300 px-2 py-2">Dosen Pengampu</th>
                  <th className="border border-stone-300 px-2 py-2 text-center w-16">Paraf</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="border border-stone-300 px-3 py-6 text-center text-stone-500"
                    >
                      Jadwal ujian untuk Kelas {selectedClass || student.class_name}, Angkatan{' '}
                      {selectedBatch || student.batch}, Tahun Akademik {academicYear} belum dipublikasikan oleh Admin.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={`${item.code}-${idx}`} className="align-middle">
                      <td className="border border-stone-300 px-2 py-2 text-center font-mono tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono font-medium text-stone-800">
                        {item.code}
                      </td>
                      <td className="border border-stone-300 px-2.5 py-2 font-medium text-stone-900">
                        {item.subject}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 text-center font-mono tabular-nums">
                        {item.sks}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-[11px] tabular-nums">
                        <div className="font-sans font-medium text-stone-800">{item.day}</div>
                        <div className="text-stone-600">{formatScheduleDateId(item.date)}</div>
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-[11px] tabular-nums">
                        {item.time}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-medium text-stone-800">
                        {item.room}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 text-stone-700">
                        {item.instructor}
                      </td>
                      <td className="border border-stone-300 px-2 py-3.5 text-center text-[10px] text-stone-400">
                        
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* TATA TERTIB & TANDA TANGAN DEKAN */}
          <div className="mt-6 grid grid-cols-12 gap-6">
            <div className="col-span-7 rounded border border-stone-200 bg-[#FAF7F2]/80 p-3.5">
              <p className="text-[11px] font-bold tracking-wide text-stone-800 uppercase">
                Tata Tertib & Catatan Penting
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-stone-700">
                {branding.important_notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ol>
            </div>

            <div className="col-span-5 flex flex-col justify-between pl-4 text-[12px]">
              <div>
                <p className="text-stone-600">Dikeluarkan pada {todayFormatted}</p>
                <p className="mt-0.5 font-semibold text-stone-900">{dean.role}</p>
              </div>

              <div className="my-3 flex items-center gap-3">
                <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded border border-stone-300 bg-white p-1">
                  {deanQrDataUrl ? (
                    <img
                      src={deanQrDataUrl}
                      alt={`QR Tanda Tangan ${dean.name}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-stone-400">QR...</span>
                  )}
                </div>
                <p className="text-[10px] leading-snug text-stone-500">
                  Ditandatangani secara elektronik melalui QR Code resmi.
                </p>
              </div>

              <div>
                <p className="font-bold text-stone-900 underline decoration-stone-400 underline-offset-4">
                  {dean.name}
                </p>
                {dean.nidn && (
                  <p className="mt-0.5 font-mono text-[11px] text-stone-600">{dean.nidn}</p>
                )}
              </div>
            </div>
          </div>

          {/* FOOTER KARTU */}
          <div className="mt-8 flex items-center justify-between border-t border-stone-200 pt-3 text-[10.5px] text-stone-500">
            <span>{branding.footer_copyright}</span>
            <span className="font-mono tabular-nums">
              ID: {student.nim} · {examType} · {academicYear}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
