import type {
  BrandingConfig,
  CardPrintStatus,
  FacultyConfig,
  Student,
} from '../types.ts';

export const DEFAULT_SUPER_ADMIN_EMAIL = 'muhtyas.yugioh@gmail.com';
export const DEFAULT_INTERNAL_DOMAIN = 'unikma.local';

export function normalizeAuthIdentifier(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return '';
  if (cleaned.includes('@')) return cleaned;
  return `${cleaned}@${DEFAULT_INTERNAL_DOMAIN}`;
}

export function formatAuthIdentifier(email: string | null | undefined): string {
  if (!email) return '';
  const suffix = `@${DEFAULT_INTERNAL_DOMAIN}`;
  if (email.toLowerCase().endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }
  return email;
}

export const CANONICAL_FACULTIES: FacultyConfig[] = [
  {
    id: 'fst',
    name: 'Fakultas Sains dan Teknologi',
    deanName: 'Nurul Alfiah, M.Kom.',
    deanNidn: '',
    majors: ['Sistem Informasi', 'Teknik Informatika', 'Teknologi Informasi'],
  },
  {
    id: 'fpis',
    name: 'Fakultas Pendidikan dan Ilmu Sosial',
    deanName: 'Much Solehudin, M.Pd.',
    deanNidn: '',
    majors: ['Bisnis Digital', 'Pendidikan Matematika'],
  },
  {
    id: 'fpai',
    name: 'Fakultas Pendidikan Agama Islam',
    deanName: 'Much Solehudin, M.Pd.',
    deanNidn: '',
    majors: ['Pendidikan Agama Islam', 'Komunikasi dan Penyiaran Islam'],
  },
];

export const CANONICAL_MAJORS: string[] = CANONICAL_FACULTIES.flatMap((f) => f.majors);

export function normalizeMajorKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^s1[\s-]+/i, '')
    .replace(/\bdan\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveFacultyForMajor(
  major: string | null | undefined,
  faculties: FacultyConfig[] = CANONICAL_FACULTIES
): FacultyConfig | null {
  const cleaned = String(major || '').trim();
  if (!cleaned) return null;
  const exactKey = cleaned.toLowerCase();
  const normalizedKey = normalizeMajorKey(cleaned);

  const exactMatch = faculties.find((f) =>
    f.majors.some((m) => m.trim().toLowerCase() === exactKey)
  );
  if (exactMatch) return exactMatch;

  return (
    faculties.find((f) =>
      f.majors.some((m) => {
        const targetNorm = normalizeMajorKey(m);
        return (
          targetNorm === normalizedKey ||
          (normalizedKey.length > 4 && targetNorm.includes(normalizedKey)) ||
          (targetNorm.length > 4 && normalizedKey.includes(targetNorm))
        );
      })
    ) || null
  );
}

export function normalizeFacultyName(raw: string | null | undefined): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  const lower = val.toLowerCase();
  if (lower === 'fakultas sains & teknologi' || lower === 'fakultas sains dan teknologi') {
    return 'Fakultas Sains dan Teknologi';
  }
  if (
    lower === 'fakultas pendidikan & ilmu sosial' ||
    lower === 'fakultas pendidikan dan ilmu sosial'
  ) {
    return 'Fakultas Pendidikan dan Ilmu Sosial';
  }
  if (lower === 'fakultas agama islam' || lower === 'fakultas pendidikan agama islam') {
    return 'Fakultas Pendidikan Agama Islam';
  }
  return val;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  id: 1,
  campus_name: 'STMIK Komputama Majenang',
  motto: 'Unggul dalam Teknologi Informasi dan Inovasi Bisnis Digital',
  primary_color: '#EA6113',
  secondary_color: '#F88F22',
  logo_url: '',
  faculties: CANONICAL_FACULTIES,
  batches: ['2022', '2023', '2024', '2025', '2026'],
  classes: ['TI-A', 'TI-B', 'SI-A', 'BD-A'],
  majors: CANONICAL_MAJORS,
  academic_years: ['2025/2026 Ganjil', '2025/2026 Genap', '2026/2027 Ganjil'],
  subjects: [
    { code: 'IF301', name: 'Algoritma & Struktur Data', sks: 3 },
    { code: 'IF302', name: 'Basis Data Lanjut', sks: 3 },
    { code: 'IF303', name: 'Rekayasa Perangkat Lunak', sks: 3 },
    { code: 'IF304', name: 'Jaringan Komputer', sks: 3 },
    { code: 'IF305', name: 'Kecerdasan Buatan', sks: 3 },
  ],
  instructors: [
    'Ahmad Fauzi, M.Kom.',
    'Rina Kusuma, S.Kom., M.T.',
    'Budi Santoso, M.Cs.',
    'Dewi Lestari, S.T., M.Kom.',
  ],
  rooms: ['R. 101', 'R. 102', 'Lab Komputer 1', 'Lab Komputer 2', 'Aula Utama'],
  time_slots: ['08:00 - 09:30', '10:00 - 11:30', '13:00 - 14:30', '15:00 - 16:30'],
  important_notes: [
    'Kartu Ujian wajib dicetak pada kertas A4 dan dibawa saat pelaksanaan ujian berlangsung.',
    'Peserta hadir di ruang ujian paling lambat 15 menit sebelum ujian dimulai.',
    'Wajib membawa kartu identitas resmi (KTM/KTP) dan mengenakan pakaian rapi serta bersepatu.',
    'Dilarang membawa catatan tidak sah atau mengoperasikan alat komunikasi selama ujian berlangsung.',
  ],
  signatory_name: 'Nurul Alfiah, M.Kom.',
  signatory_role: 'Dekan Fakultas Sains dan Teknologi',
  footer_copyright: 'Panitia Ujian Akademik — Sistem Informasi Distribusi Kartu Ujian',
};

export function getStudentPrintStatus(student: Pick<Student, 'can_print' | 'last_downloaded_at'>): CardPrintStatus {
  if (!student.can_print) return 'Diblokir';
  if (student.last_downloaded_at) return 'Sudah Cetak';
  return 'Siap Cetak';
}

export function resolveDeanForStudent(
  student: Pick<Student, 'faculty' | 'major'> | null,
  branding: BrandingConfig
): { role: string; name: string; nidn: string } {
  if (student) {
    const byMajor = resolveFacultyForMajor(student.major, branding.faculties);
    if (byMajor) {
      return {
        role: `Dekan ${byMajor.name}`,
        name: byMajor.deanName,
        nidn: byMajor.deanNidn,
      };
    }

    const normalizedStudentFac = normalizeFacultyName(student.faculty).toLowerCase();
    const byFaculty = branding.faculties.find(
      (f: FacultyConfig) =>
        f.name.toLowerCase() === student.faculty.toLowerCase() ||
        normalizeFacultyName(f.name).toLowerCase() === normalizedStudentFac
    );
    if (byFaculty) {
      return {
        role: `Dekan ${byFaculty.name}`,
        name: byFaculty.deanName,
        nidn: byFaculty.deanNidn,
      };
    }
  }

  return {
    role: branding.signatory_role || 'Ketua Panitia Ujian',
    name: branding.signatory_name || '-',
    nidn: '',
  };
}

export function buildQrPayload(nim: string, examType: 'UTS' | 'UAS'): string {
  return `VERIFIED_KOMPUTAMA_${nim.trim().toUpperCase()}_${examType}`;
}

export function parseQrOrNimInput(raw: string): {
  nim: string;
  examTypeFromQr: 'UTS' | 'UAS' | null;
  isFormattedQr: boolean;
} {
  const cleaned = raw.trim();
  const match = cleaned.match(/^VERIFIED_KOMPUTAMA_([A-Za-z0-9._-]+)_(UTS|UAS)$/i);
  if (match) {
    return {
      nim: match[1].toUpperCase(),
      examTypeFromQr: match[2].toUpperCase() as 'UTS' | 'UAS',
      isFormattedQr: true,
    };
  }
  return {
    nim: cleaned,
    examTypeFromQr: null,
    isFormattedQr: false,
  };
}

export function formatDateTimeId(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function normalizeExamDate(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(raw).trim();
  if (!str || str === '-') return str;

  // Excel serial date numbers (e.g. 46351 -> 2026-11-25)
  if (/^\d{4,5}(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    if (serial >= 20000 && serial <= 90000) {
      const utcMs = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
      const dt = new Date(utcMs);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toISOString().slice(0, 10);
      }
    }
  }

  // Already YYYY-MM-DD or ISO prefix
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return str;
}

export function getIndonesianDayFromDate(raw: unknown): string {
  const iso = normalizeExamDate(raw);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ID_DAYS[dt.getUTCDay()] || '';
}

export function formatScheduleDateId(raw: unknown): string {
  const iso = normalizeExamDate(raw);
  if (!iso || iso === '-') return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  }
  return iso;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];

  // UTF-8 BOM for clean Excel Indonesian character rendering
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
