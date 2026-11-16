import * as XLSX from 'xlsx';
import type { ExamSchedule, ScheduleItem, Student } from '../types.ts';
import { getIndonesianDayFromDate, normalizeExamDate } from './defaults.ts';

export function downloadStudentExcelTemplate(): void {
  const sampleRows = [
    {
      NIM: '202401001',
      Nama: 'Bagas Pratama Putra',
      Fakultas: 'Fakultas Sains dan Teknologi',
      Prodi: 'Teknik Informatika',
      Kelas: 'TI-A',
      Kampus: 'STMIK Komputama Majenang',
      Angkatan: '2024',
      Jenis: 'Reguler',
      IzinCetak: 'YA',
    },
    {
      NIM: '202401002',
      Nama: 'Nadia Putri Rahmawati',
      Fakultas: 'Fakultas Sains dan Teknologi',
      Prodi: 'Sistem Informasi',
      Kelas: 'SI-A',
      Kampus: 'STMIK Komputama Majenang',
      Angkatan: '2024',
      Jenis: 'Karyawan',
      IzinCetak: 'TIDAK',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 30 },
    { wch: 22 },
    { wch: 10 },
    { wch: 26 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Mahasiswa');
  XLSX.writeFile(wb, 'Template_Import_Mahasiswa.xlsx');
}

export async function parseStudentExcelFile(file: File): Promise<Partial<Student>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
    defval: '',
  });

  return rawRows
    .map((row) => {
      const get = (keys: string[]) => {
        for (const k of Object.keys(row)) {
          if (keys.includes(k.trim().toLowerCase())) {
            return String(row[k] ?? '').trim();
          }
        }
        return '';
      };

      const nim = get(['nim', 'no_induk', 'nomor induk']);
      const name = get(['nama', 'name', 'nama lengkap']);
      const izinStr = get(['izincetak', 'izin_cetak', 'can_print', 'status', 'izin']).toUpperCase();
      const canPrint =
        izinStr === '' ||
        izinStr === 'YA' ||
        izinStr === 'TRUE' ||
        izinStr === '1' ||
        izinStr === 'AKTIF' ||
        izinStr === 'SIAP';

      return {
        nim,
        name,
        faculty: get(['fakultas', 'faculty']),
        major: get(['prodi', 'major', 'program studi']),
        class_name: get(['kelas', 'class', 'class_name']),
        campus: get(['kampus', 'campus']) || 'Kampus Utama',
        batch: get(['angkatan', 'batch', 'tahun']),
        student_type: get(['jenis', 'student_type', 'tipe']) || 'Reguler',
        can_print: canPrint,
      };
    })
    .filter((s) => Boolean(s.nim && s.name));
}

export function downloadScheduleExcelTemplate(): void {
  const sampleRows = [
    {
      Kelas: 'TI-A',
      Angkatan: '2024',
      TahunAkademik: '2026/2027 Ganjil',
      Kampus: 'STMIK Komputama Majenang',
      Prodi: 'Teknik Informatika',
      KodeMK: 'IF301',
      MataKuliah: 'Algoritma & Struktur Data',
      SKS: 3,
      Hari: 'Senin',
      Tanggal: '2026-11-23',
      Waktu: '08:00 - 09:30',
      Ruang: 'R. 101',
      Dosen: 'Ahmad Fauzi, M.Kom.',
    },
    {
      Kelas: 'TI-A',
      Angkatan: '2024',
      TahunAkademik: '2026/2027 Ganjil',
      Kampus: 'STMIK Komputama Majenang',
      Prodi: 'Teknik Informatika',
      KodeMK: 'IF302',
      MataKuliah: 'Basis Data Lanjut',
      SKS: 3,
      Hari: 'Selasa',
      Tanggal: '2026-11-24',
      Waktu: '10:00 - 11:30',
      Ruang: 'Lab Komputer 1',
      Dosen: 'Rina Kusuma, S.Kom., M.T.',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 24 },
    { wch: 22 },
    { wch: 10 },
    { wch: 28 },
    { wch: 6 },
    { wch: 10 },
    { wch: 13 },
    { wch: 15 },
    { wch: 16 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal_Ujian');
  XLSX.writeFile(wb, 'Template_Import_Jadwal_Ujian.xlsx');
}

export async function parseScheduleExcelFile(file: File): Promise<ExamSchedule[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
    defval: '',
  });

  const map = new Map<string, ExamSchedule>();

  for (const row of rawRows) {
    const getRaw = (keys: string[]): unknown => {
      for (const k of Object.keys(row)) {
        if (keys.includes(k.trim().toLowerCase())) {
          return row[k];
        }
      }
      return '';
    };
    const get = (keys: string[]) => String(getRaw(keys) ?? '').trim();

    const classId = get(['kelas', 'class_id', 'class']);
    const batchId = get(['angkatan', 'batch_id', 'batch']);
    const academicYear = get(['tahunakademik', 'tahun_akademik', 'academic_year', 'tahun']);
    const subject = get(['matakuliah', 'mata_kuliah', 'subject', 'mk']);

    if (!classId || !batchId || !academicYear || !subject) continue;

    const id = `${classId}_${batchId}_${academicYear}`;
    if (!map.has(id)) {
      map.set(id, {
        id,
        class_id: classId,
        batch_id: batchId,
        academic_year: academicYear,
        campus: get(['kampus', 'campus']) || 'Kampus Utama',
        major: get(['prodi', 'major', 'program studi']),
        schedules: [],
      });
    }

    const normalizedDate = normalizeExamDate(getRaw(['tanggal', 'date'])) || '-';
    const rawDay = get(['hari', 'day']);
    const day = rawDay && rawDay !== '-' ? rawDay : getIndonesianDayFromDate(normalizedDate) || '-';

    const item: ScheduleItem = {
      code: get(['kodemk', 'kode_mk', 'kode', 'code']) || '-',
      subject,
      sks: Number(get(['sks']) || 2) || 2,
      day,
      date: normalizedDate,
      time: get(['waktu', 'jam', 'time']) || '-',
      room: get(['ruang', 'ruangan', 'room']) || '-',
      instructor: get(['dosen', 'pengampu', 'instructor']) || '-',
    };

    map.get(id)!.schedules.push(item);
  }

  return Array.from(map.values());
}
