import {
  CANONICAL_FACULTIES,
  CANONICAL_MAJORS,
  DEFAULT_BRANDING,
  getIndonesianDayFromDate,
  normalizeAuthIdentifier,
  normalizeExamDate,
  normalizeFacultyName,
  resolveFacultyForMajor,
} from './defaults.ts';
import type {
  AdminUser,
  BrandingConfig,
  ExamAttendance,
  ExamSchedule,
  FacultyConfig,
  MasterSubject,
  ProctorUser,
  ScheduleItem,
  Student,
} from '../types.ts';

export interface BackupImportOptions {
  importStudents: boolean;
  importSchedules: boolean;
  importMasterData: boolean;
  importIdentity: boolean;
  preserveSunsetColors: boolean;
  importUsers: boolean;
  importAttendance: boolean;
}

export interface ParsedBackupPayload {
  meta: {
    exportedAt: string;
    sourceType: 'firestore' | 'portal' | 'unknown';
    projectId: string;
  };
  students: Student[];
  schedules: ExamSchedule[];
  admins: AdminUser[];
  proctors: ProctorUser[];
  attendance: ExamAttendance[];
  masterData: Pick<
    BrandingConfig,
    | 'faculties'
    | 'batches'
    | 'classes'
    | 'majors'
    | 'academic_years'
    | 'subjects'
    | 'instructors'
    | 'rooms'
    | 'time_slots'
  > | null;
  identityData: Pick<
    BrandingConfig,
    | 'campus_name'
    | 'motto'
    | 'primary_color'
    | 'secondary_color'
    | 'logo_url'
    | 'signatory_name'
    | 'signatory_role'
    | 'footer_copyright'
    | 'important_notes'
  > | null;
  hasIgnoredFields: string[];
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const val = String(raw ?? '').trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
}

function toValidIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  const dt = new Date(String(val));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function parseBackupJsonPayload(rawInput: unknown): ParsedBackupPayload {
  if (!rawInput || typeof rawInput !== 'object') {
    throw new Error('Format file JSON tidak valid.');
  }

  const root = rawInput as Record<string, unknown>;
  const collections =
    root.collections && typeof root.collections === 'object'
      ? (root.collections as Record<string, unknown>)
      : root;

  const isFirestore =
    Boolean(root.firestoreDatabaseId) ||
    Boolean(root.projectId) ||
    Boolean(root.collections);

  const rawStudents = Array.isArray(collections.students) ? collections.students : [];
  const rawSchedules = Array.isArray(collections.schedules) ? collections.schedules : [];
  const rawAdmins = Array.isArray(collections.admins) ? collections.admins : [];
  const rawProctors = Array.isArray(collections.proctors) ? collections.proctors : [];
  const rawAttendance = Array.isArray(collections.exam_attendance)
    ? collections.exam_attendance
    : [];
  const rawBranding =
    collections.branding && typeof collections.branding === 'object'
      ? (collections.branding as Record<string, unknown>)
      : null;

  // 1. Students (deduplicate by lowercase NIM)
  const studentMap = new Map<string, Student>();
  for (const item of rawStudents) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const nim = String(r.nim ?? '').trim();
    const name = String(r.name ?? '').trim();
    if (!nim || !name) continue;

    const major = String(r.major ?? '').trim();
    const matchedFaculty = resolveFacultyForMajor(major, CANONICAL_FACULTIES);
    const resolvedFaculty =
      matchedFaculty?.name || normalizeFacultyName(String(r.faculty ?? '').trim());

    const canPrintRaw = r.can_print !== undefined ? r.can_print : r.canPrint;
    studentMap.set(nim.toLowerCase(), {
      nim,
      name,
      faculty: resolvedFaculty,
      major,
      class_name: String(r.class_name ?? r.className ?? '').trim(),
      campus: String(r.campus ?? 'Kampus Utama').trim() || 'Kampus Utama',
      batch: String(r.batch ?? '').trim(),
      can_print: canPrintRaw !== undefined ? Boolean(canPrintRaw) : true,
      student_type: String(r.student_type ?? r.studentType ?? 'Reguler').trim() || 'Reguler',
      last_downloaded_at: toValidIsoOrNull(r.last_downloaded_at ?? r.lastDownloadedAt),
    });
  }
  const students = Array.from(studentMap.values());

  // Helper lookup to infer major & campus on schedules exported without those fields
  const findStudentHint = (classId: string, batchId: string): Student | undefined => {
    return (
      students.find(
        (s) =>
          s.class_name.toLowerCase() === classId.toLowerCase() &&
          s.batch.toLowerCase() === batchId.toLowerCase()
      ) || students.find((s) => s.class_name.toLowerCase() === classId.toLowerCase())
    );
  };

  // 2. Schedules (deduplicate by id)
  const scheduleMap = new Map<string, ExamSchedule>();
  const subjectHintMap = new Map<string, { code: string; sks: number }>();

  for (const item of rawSchedules) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const classId = String(s.class_id ?? s.classId ?? '').trim();
    const batchId = String(s.batch_id ?? s.batchId ?? '').trim();
    const academicYear = String(s.academic_year ?? s.academicYear ?? '').trim();
    if (!classId || !batchId || !academicYear) continue;

    const id = String(s.id ?? `${classId}_${batchId}_${academicYear}`).trim();
    const hint = findStudentHint(classId, batchId);

    const rawRows = Array.isArray(s.schedules) ? s.schedules : [];
    const normalizedRows: ScheduleItem[] = rawRows
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
      .map((row) => {
        const dateStr = normalizeExamDate(row.date) || String(row.date ?? '-').trim();
        const subjectName = String(row.subject ?? '').trim();
        const code = String(row.code ?? '').trim();
        const sks = Number(row.sks) || 2;
        if (subjectName && !subjectHintMap.has(subjectName.toLowerCase())) {
          subjectHintMap.set(subjectName.toLowerCase(), { code, sks });
        }
        return {
          code,
          subject: subjectName,
          instructor: String(row.instructor ?? '').trim(),
          day: String(row.day ?? '').trim() || getIndonesianDayFromDate(dateStr) || 'Senin',
          date: dateStr,
          time: String(row.time ?? '').trim(),
          room: String(row.room ?? '').trim(),
          sks,
        };
      });

    scheduleMap.set(id, {
      id,
      class_id: classId,
      batch_id: batchId,
      academic_year: academicYear,
      campus: String(s.campus ?? hint?.campus ?? 'Kampus Utama').trim() || 'Kampus Utama',
      major: String(s.major ?? hint?.major ?? '').trim(),
      schedules: normalizedRows,
    });
  }
  const schedules = Array.from(scheduleMap.values());

  // 3. Admins
  const adminMap = new Map<string, AdminUser>();
  for (const item of rawAdmins) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const email = normalizeAuthIdentifier(String(a.email ?? ''));
    if (!email) continue;
    adminMap.set(email, {
      email,
      name: String(a.name ?? '').trim() || email.split('@')[0],
      role: a.role === 'superadmin' ? 'superadmin' : 'admin',
      added_at: toValidIsoOrNull(a.added_at ?? a.addedAt) || new Date().toISOString(),
      added_by: String(a.added_by ?? a.addedBy ?? 'backup-import').trim(),
    });
  }
  const admins = Array.from(adminMap.values());

  // 4. Proctors
  const proctorMap = new Map<string, ProctorUser>();
  for (const item of rawProctors) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const email = normalizeAuthIdentifier(String(p.email ?? ''));
    if (!email) continue;
    proctorMap.set(email, {
      email,
      name: String(p.name ?? '').trim() || email.split('@')[0],
      assigned_room: String(p.assigned_room ?? p.assignedRoom ?? '').trim(),
      faculty: String(p.faculty ?? '').trim(),
      added_at: toValidIsoOrNull(p.added_at ?? p.addedAt) || new Date().toISOString(),
      added_by: String(p.added_by ?? p.addedBy ?? 'backup-import').trim(),
    });
  }
  const proctors = Array.from(proctorMap.values());

  // 5. Exam Attendance
  const attendanceMap = new Map<string, ExamAttendance>();
  for (const item of rawAttendance) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const nim = String(a.nim ?? '').trim();
    const examType = (a.exam_type ?? a.examType) === 'UAS' ? 'UAS' : 'UTS';
    const academicYear = String(a.academic_year ?? a.academicYear ?? '').trim();
    const subjectCode = String(a.subject_code ?? a.subjectCode ?? '').trim();
    if (!nim || !academicYear || !subjectCode) continue;

    const id = String(a.id ?? `${nim}_${examType}_${academicYear}_${subjectCode}`).trim();
    const statusRaw = String(a.status ?? 'Hadir');
    const status =
      statusRaw === 'Izin' || statusRaw === 'Tidak Hadir' ? statusRaw : 'Hadir';

    attendanceMap.set(id, {
      id,
      nim,
      student_name: String(a.student_name ?? a.studentName ?? '').trim(),
      major: String(a.major ?? '').trim(),
      class_name: String(a.class_name ?? a.className ?? '').trim(),
      batch: String(a.batch ?? '').trim(),
      exam_type: examType,
      academic_year: academicYear,
      subject_code: subjectCode,
      subject_name: String(a.subject_name ?? a.subjectName ?? subjectCode).trim(),
      room: String(a.room ?? '').trim(),
      status,
      card_verified: Boolean(a.card_verified ?? a.cardVerified ?? true),
      note: String(a.note ?? '').trim(),
      proctor_email: normalizeAuthIdentifier(String(a.proctor_email ?? a.proctorEmail ?? '')),
      proctor_name: String(a.proctor_name ?? a.proctorName ?? '').trim(),
      verified_at: toValidIsoOrNull(a.verified_at ?? a.verifiedAt) || new Date().toISOString(),
    });
  }
  const attendance = Array.from(attendanceMap.values());

  // 6. Branding -> Master Data + Identity Data
  const hasIgnoredFields: string[] = [];
  if (rawBranding) {
    if ('adminPassword' in rawBranding) hasIgnoredFields.push('branding.adminPassword');
    if ('bgUrl' in rawBranding) hasIgnoredFields.push('branding.bgUrl');
  }
  if (Array.isArray(collections.registrations_kkn)) {
    hasIgnoredFields.push('registrations_kkn');
  }
  if (Array.isArray(collections.registrations_kp)) {
    hasIgnoredFields.push('registrations_kp');
  }

  let masterData: ParsedBackupPayload['masterData'] = null;
  let identityData: ParsedBackupPayload['identityData'] = null;

  if (rawBranding) {
    const rawFaculties = Array.isArray(rawBranding.faculties) ? rawBranding.faculties : [];
    const importedFaculties: FacultyConfig[] = rawFaculties
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
      .map((f, idx) => ({
        id: String(f.id ?? `fac_${idx + 1}`).trim(),
        name: normalizeFacultyName(String(f.name ?? '').trim()),
        deanName: String(f.deanName ?? f.signatoryName ?? '').trim(),
        deanNidn: String(f.deanNidn ?? '').trim(),
        majors: uniqueStrings(Array.isArray(f.majors) ? f.majors : []),
      }))
      .filter((f) => Boolean(f.name));

    const faculties: FacultyConfig[] = CANONICAL_FACULTIES.map((canon) => {
      const matched = importedFaculties.find(
        (imp) => imp.name.toLowerCase() === canon.name.toLowerCase() || imp.id === canon.id
      );
      return {
        ...canon,
        deanName: matched?.deanName || canon.deanName,
        deanNidn: matched?.deanNidn || canon.deanNidn,
      };
    });

    for (const imp of importedFaculties) {
      if (!faculties.some((f) => f.name.toLowerCase() === imp.name.toLowerCase())) {
        faculties.push(imp);
      }
    }

    const rawSubjects = Array.isArray(rawBranding.subjects) ? rawBranding.subjects : [];
    const subjectMap = new Map<string, MasterSubject>();
    let autoIdx = 1;

    for (const s of rawSubjects) {
      if (typeof s === 'string') {
        const name = s.trim();
        if (!name || subjectMap.has(name.toLowerCase())) continue;
        const hint = subjectHintMap.get(name.toLowerCase());
        const code = hint?.code || `MK${String(autoIdx).padStart(3, '0')}`;
        autoIdx += 1;
        subjectMap.set(name.toLowerCase(), {
          code,
          name,
          sks: hint?.sks || 2,
        });
      } else if (s && typeof s === 'object') {
        const obj = s as Record<string, unknown>;
        const name = String(obj.name ?? '').trim();
        if (!name || subjectMap.has(name.toLowerCase())) continue;
        const code = String(obj.code ?? `MK${String(autoIdx).padStart(3, '0')}`).trim();
        autoIdx += 1;
        subjectMap.set(name.toLowerCase(), {
          code,
          name,
          sks: Number(obj.sks) || 2,
        });
      }
    }

    // Also include any subjects present in schedules that weren't listed in branding.subjects
    for (const sched of schedules) {
      for (const row of sched.schedules) {
        if (!row.subject || subjectMap.has(row.subject.toLowerCase())) continue;
        const code = row.code || `MK${String(autoIdx).padStart(3, '0')}`;
        autoIdx += 1;
        subjectMap.set(row.subject.toLowerCase(), {
          code,
          name: row.subject,
          sks: Number(row.sks) || 2,
        });
      }
    }

    const batches = uniqueStrings([
      ...(Array.isArray(rawBranding.batches) ? rawBranding.batches : []),
      ...students.map((s) => s.batch),
      ...schedules.map((s) => s.batch_id),
    ]);

    const classes = uniqueStrings([
      ...(Array.isArray(rawBranding.classes) ? rawBranding.classes : []),
      ...students.map((s) => s.class_name),
      ...schedules.map((s) => s.class_id),
    ]);

    const majors = uniqueStrings([
      ...CANONICAL_MAJORS,
      ...(Array.isArray(rawBranding.majors) ? rawBranding.majors : []),
      ...faculties.flatMap((f) => f.majors),
      ...students.map((s) => s.major),
    ]);

    const academicYearsRaw = Array.isArray(rawBranding.academic_years)
      ? rawBranding.academic_years
      : Array.isArray(rawBranding.academicYears)
      ? rawBranding.academicYears
      : [];
    const academic_years = uniqueStrings([
      ...academicYearsRaw,
      ...schedules.map((s) => s.academic_year),
    ]);

    const instructors = uniqueStrings([
      ...(Array.isArray(rawBranding.instructors) ? rawBranding.instructors : []),
      ...schedules.flatMap((s) => s.schedules.map((item) => item.instructor)),
    ]);

    const rooms = uniqueStrings([
      ...(Array.isArray(rawBranding.rooms) ? rawBranding.rooms : []),
      ...schedules.flatMap((s) => s.schedules.map((item) => item.room)),
    ]);

    const timeSlotsRaw = Array.isArray(rawBranding.time_slots)
      ? rawBranding.time_slots
      : Array.isArray(rawBranding.timeSlots)
      ? rawBranding.timeSlots
      : [];
    const time_slots = uniqueStrings([
      ...timeSlotsRaw,
      ...schedules.flatMap((s) => s.schedules.map((item) => item.time)),
    ]);

    masterData = {
      faculties: faculties.length > 0 ? faculties : DEFAULT_BRANDING.faculties,
      batches,
      classes,
      majors,
      academic_years,
      subjects: Array.from(subjectMap.values()),
      instructors,
      rooms,
      time_slots,
    };

    const notesRaw = Array.isArray(rawBranding.important_notes)
      ? rawBranding.important_notes
      : Array.isArray(rawBranding.importantNotes)
      ? rawBranding.importantNotes
      : DEFAULT_BRANDING.important_notes;

    identityData = {
      campus_name: String(
        rawBranding.campus_name ?? rawBranding.campusName ?? DEFAULT_BRANDING.campus_name
      ).trim(),
      motto: String(rawBranding.motto ?? DEFAULT_BRANDING.motto).trim(),
      primary_color: String(
        rawBranding.primary_color ?? rawBranding.primaryColor ?? DEFAULT_BRANDING.primary_color
      ).trim(),
      secondary_color: String(
        rawBranding.secondary_color ??
          rawBranding.secondaryColor ??
          DEFAULT_BRANDING.secondary_color
      ).trim(),
      logo_url: String(rawBranding.logo_url ?? rawBranding.logoUrl ?? '').trim(),
      signatory_name: String(
        rawBranding.signatory_name ?? rawBranding.signatoryName ?? DEFAULT_BRANDING.signatory_name
      ).trim(),
      signatory_role: String(
        rawBranding.signatory_role ?? rawBranding.signatoryRole ?? DEFAULT_BRANDING.signatory_role
      ).trim(),
      footer_copyright: String(
        rawBranding.footer_copyright ??
          rawBranding.footerCopyright ??
          DEFAULT_BRANDING.footer_copyright
      ).trim(),
      important_notes: uniqueStrings(notesRaw),
    };
  }

  return {
    meta: {
      exportedAt: String(root.exportedAt ?? ''),
      sourceType: isFirestore ? 'firestore' : 'portal',
      projectId: String(root.projectId ?? ''),
    },
    students,
    schedules,
    admins,
    proctors,
    attendance,
    masterData,
    identityData,
    hasIgnoredFields,
  };
}

function sqlLiteral(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlJsonb(val: unknown): string {
  return `${sqlLiteral(JSON.stringify(val))}::jsonb`;
}

export function generateSupabaseImportSql(
  parsed: ParsedBackupPayload,
  options: BackupImportOptions,
  currentBranding: BrandingConfig
): string {
  const chunks: string[] = [
    '-- ============================================================================',
    '-- SCRIPT IMPOR BACKUP JSON -> SUPABASE POSTGRESQL',
    `-- Sumber: ${parsed.meta.sourceType.toUpperCase()} ${parsed.meta.projectId || ''}`,
    `-- Dibuat pada: ${new Date().toISOString()}`,
    '-- Jalankan di Supabase SQL Editor bila ingin mengimpor secara manual.',
    '-- ============================================================================',
    '',
  ];

  if (options.importStudents && parsed.students.length > 0) {
    chunks.push(`-- 1. MAHASISWA (${parsed.students.length} baris)`);
    const batchSize = 100;
    for (let i = 0; i < parsed.students.length; i += batchSize) {
      const slice = parsed.students.slice(i, i + batchSize);
      const values = slice
        .map(
          (s) =>
            `(${sqlLiteral(s.nim)}, ${sqlLiteral(s.name)}, ${sqlLiteral(s.faculty)}, ${sqlLiteral(
              s.major
            )}, ${sqlLiteral(s.class_name)}, ${sqlLiteral(s.campus)}, ${sqlLiteral(s.batch)}, ${
              s.can_print ? 'TRUE' : 'FALSE'
            }, ${sqlLiteral(s.student_type)}, ${
              s.last_downloaded_at ? sqlLiteral(s.last_downloaded_at) : 'NULL'
            })`
        )
        .join(',\n  ');
      chunks.push(
        `INSERT INTO public.students (nim, name, faculty, major, class_name, campus, batch, can_print, student_type, last_downloaded_at)\nVALUES\n  ${values}\nON CONFLICT (nim) DO UPDATE SET\n  name = EXCLUDED.name,\n  faculty = EXCLUDED.faculty,\n  major = EXCLUDED.major,\n  class_name = EXCLUDED.class_name,\n  campus = EXCLUDED.campus,\n  batch = EXCLUDED.batch,\n  can_print = EXCLUDED.can_print,\n  student_type = EXCLUDED.student_type,\n  last_downloaded_at = EXCLUDED.last_downloaded_at,\n  updated_at = NOW();\n`
      );
    }
  }

  if (options.importSchedules && parsed.schedules.length > 0) {
    chunks.push(`-- 2. JADWAL UJIAN (${parsed.schedules.length} paket)`);
    const values = parsed.schedules
      .map(
        (sc) =>
          `(${sqlLiteral(sc.id)}, ${sqlLiteral(sc.class_id)}, ${sqlLiteral(
            sc.batch_id
          )}, ${sqlLiteral(sc.academic_year)}, ${sqlLiteral(sc.campus)}, ${sqlLiteral(
            sc.major
          )}, ${sqlJsonb(sc.schedules)})`
      )
      .join(',\n  ');
    chunks.push(
      `INSERT INTO public.schedules (id, class_id, batch_id, academic_year, campus, major, schedules)\nVALUES\n  ${values}\nON CONFLICT (id) DO UPDATE SET\n  class_id = EXCLUDED.class_id,\n  batch_id = EXCLUDED.batch_id,\n  academic_year = EXCLUDED.academic_year,\n  campus = EXCLUDED.campus,\n  major = EXCLUDED.major,\n  schedules = EXCLUDED.schedules,\n  updated_at = NOW();\n`
    );
  }

  if (options.importUsers && parsed.admins.length > 0) {
    chunks.push(`-- 3. ADMIN (${parsed.admins.length} akun)`);
    const values = parsed.admins
      .map(
        (a) =>
          `(${sqlLiteral(a.email)}, ${sqlLiteral(a.name)}, ${sqlLiteral(a.role)}, ${sqlLiteral(
            a.added_at
          )}, ${sqlLiteral(a.added_by)})`
      )
      .join(',\n  ');
    chunks.push(
      `INSERT INTO public.admins (email, name, role, added_at, added_by)\nVALUES\n  ${values}\nON CONFLICT (email) DO UPDATE SET\n  name = EXCLUDED.name,\n  role = EXCLUDED.role;\n`
    );
  }

  if (options.importUsers && parsed.proctors.length > 0) {
    chunks.push(`-- 4. PENGAWAS (${parsed.proctors.length} akun)`);
    const values = parsed.proctors
      .map(
        (p) =>
          `(${sqlLiteral(p.email)}, ${sqlLiteral(p.name)}, ${sqlLiteral(
            p.assigned_room
          )}, ${sqlLiteral(p.faculty)}, ${sqlLiteral(p.added_at)}, ${sqlLiteral(p.added_by)})`
      )
      .join(',\n  ');
    chunks.push(
      `INSERT INTO public.proctors (email, name, assigned_room, faculty, added_at, added_by)\nVALUES\n  ${values}\nON CONFLICT (email) DO UPDATE SET\n  name = EXCLUDED.name,\n  assigned_room = EXCLUDED.assigned_room,\n  faculty = EXCLUDED.faculty;\n`
    );
  }

  if ((options.importMasterData && parsed.masterData) || (options.importIdentity && parsed.identityData)) {
    const merged: BrandingConfig = {
      ...currentBranding,
      ...(options.importMasterData && parsed.masterData ? parsed.masterData : {}),
      ...(options.importIdentity && parsed.identityData
        ? {
            ...parsed.identityData,
            primary_color: options.preserveSunsetColors
              ? currentBranding.primary_color
              : parsed.identityData.primary_color,
            secondary_color: options.preserveSunsetColors
              ? currentBranding.secondary_color
              : parsed.identityData.secondary_color,
          }
        : {}),
      id: 1,
    };
    chunks.push('-- 5. BRANDING & DATA MASTER');
    chunks.push(
      `INSERT INTO public.branding (id, campus_name, motto, primary_color, secondary_color, logo_url, faculties, batches, classes, majors, academic_years, subjects, instructors, rooms, time_slots, important_notes, signatory_name, signatory_role, footer_copyright)\nVALUES (1, ${sqlLiteral(
        merged.campus_name
      )}, ${sqlLiteral(merged.motto)}, ${sqlLiteral(merged.primary_color)}, ${sqlLiteral(
        merged.secondary_color
      )}, ${sqlLiteral(merged.logo_url)}, ${sqlJsonb(merged.faculties)}, ${sqlJsonb(
        merged.batches
      )}, ${sqlJsonb(merged.classes)}, ${sqlJsonb(merged.majors)}, ${sqlJsonb(
        merged.academic_years
      )}, ${sqlJsonb(merged.subjects)}, ${sqlJsonb(merged.instructors)}, ${sqlJsonb(
        merged.rooms
      )}, ${sqlJsonb(merged.time_slots)}, ${sqlJsonb(merged.important_notes)}, ${sqlLiteral(
        merged.signatory_name
      )}, ${sqlLiteral(merged.signatory_role)}, ${sqlLiteral(
        merged.footer_copyright
      )})\nON CONFLICT (id) DO UPDATE SET\n  campus_name = EXCLUDED.campus_name,\n  motto = EXCLUDED.motto,\n  primary_color = EXCLUDED.primary_color,\n  secondary_color = EXCLUDED.secondary_color,\n  logo_url = EXCLUDED.logo_url,\n  faculties = EXCLUDED.faculties,\n  batches = EXCLUDED.batches,\n  classes = EXCLUDED.classes,\n  majors = EXCLUDED.majors,\n  academic_years = EXCLUDED.academic_years,\n  subjects = EXCLUDED.subjects,\n  instructors = EXCLUDED.instructors,\n  rooms = EXCLUDED.rooms,\n  time_slots = EXCLUDED.time_slots,\n  important_notes = EXCLUDED.important_notes,\n  signatory_name = EXCLUDED.signatory_name,\n  signatory_role = EXCLUDED.signatory_role,\n  footer_copyright = EXCLUDED.footer_copyright,\n  updated_at = NOW();\n`
    );
  }

  return chunks.join('\n');
}
