import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CANONICAL_FACULTIES,
  CANONICAL_MAJORS,
  DEFAULT_BRANDING,
  DEFAULT_SUPER_ADMIN_EMAIL,
  getStudentPrintStatus,
  normalizeAuthIdentifier,
  normalizeExamDate,
  normalizeFacultyName,
  parseQrOrNimInput,
  resolveFacultyForMajor,
} from './src/lib/defaults.ts';
import {
  parseBackupJsonPayload,
  type BackupImportOptions,
} from './src/lib/backupImport.ts';
import type {
  AdminUser,
  AttendanceStatus,
  BrandingConfig,
  ExamSchedule,
  ExamType,
  ProctorUser,
  Student,
  UserAuthStatus,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
const REQUESTED_ADMIN_EMAIL = normalizeAuthIdentifier(process.env.ADMIN_USERNAME || 'adminkartuunikma');
const REQUESTED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'unikma@123';
const SUPER_ADMIN_EMAILS = new Set([SUPER_ADMIN_EMAIL, REQUESTED_ADMIN_EMAIL]);

const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasServiceRole = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Server-only Supabase client with Service Role (bypasses RLS after strict server auth checks)
// NEVER exposed to frontend.
const supabaseService: SupabaseClient | null = hasServiceRole
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const supabasePublic: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function getDbClient(userToken?: string): SupabaseClient | null {
  if (isSupabaseConfigured && userToken) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  if (supabaseService) return supabaseService;
  return supabasePublic;
}

interface VerifiedRequest extends Request {
  authContext?: {
    token: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
    isAdmin: boolean;
    isProctor: boolean;
    adminInfo: AdminUser | null;
    proctorInfo: ProctorUser | null;
  };
}

async function resolveAuthContext(req: Request) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !isSupabaseConfigured) return null;

  const verifier = supabaseService || supabasePublic;
  if (!verifier) return null;

  const { data: userData, error } = await verifier.auth.getUser(token);
  if (error || !userData?.user?.email) return null;

  const email = userData.user.email.toLowerCase().trim();
  const fullName =
    (userData.user.user_metadata?.full_name as string) ||
    (userData.user.user_metadata?.name as string) ||
    email.split('@')[0];

  const db = supabaseService || getDbClient(token);
  let adminInfo: AdminUser | null = null;
  let proctorInfo: ProctorUser | null = null;

  if (db) {
    const { data: adminRow } = await db
      .from('admins')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (adminRow) adminInfo = adminRow as AdminUser;

    const { data: proctorRow } = await db
      .from('proctors')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (proctorRow) proctorInfo = proctorRow as ProctorUser;
  }

  const isSuperAdmin = SUPER_ADMIN_EMAILS.has(email) || adminInfo?.role === 'superadmin';
  const isAdmin = isSuperAdmin || Boolean(adminInfo);
  const isProctor = isAdmin || Boolean(proctorInfo);

  return {
    token,
    email,
    name: adminInfo?.name || proctorInfo?.name || fullName,
    isSuperAdmin,
    isAdmin,
    isProctor,
    adminInfo,
    proctorInfo,
  };
}

async function requireProctorOrAdmin(req: VerifiedRequest, res: Response, next: NextFunction) {
  try {
    const ctx = await resolveAuthContext(req);
    if (!ctx) {
      return res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    }
    if (!ctx.isProctor) {
      return res.status(403).json({
        error: `Akun ${ctx.email} belum terdaftar sebagai Pengawas Ujian atau Admin.`,
      });
    }
    req.authContext = ctx;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi otorisasi pengawas.' });
  }
}

async function requireAdmin(req: VerifiedRequest, res: Response, next: NextFunction) {
  try {
    const ctx = await resolveAuthContext(req);
    if (!ctx) {
      return res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    }
    if (!ctx.isAdmin) {
      return res.status(403).json({
        error: `Akun ${ctx.email} tidak memiliki hak akses Admin.`,
      });
    }
    req.authContext = ctx;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi otorisasi admin.' });
  }
}

async function loadBranding(db: SupabaseClient | null): Promise<BrandingConfig> {
  if (!db) return DEFAULT_BRANDING;
  const { data } = await db.from('branding').select('*').eq('id', 1).maybeSingle();
  if (!data) return DEFAULT_BRANDING;
  return {
    ...DEFAULT_BRANDING,
    ...data,
    faculties: Array.isArray(data.faculties) ? data.faculties : DEFAULT_BRANDING.faculties,
    batches: Array.isArray(data.batches) ? data.batches : DEFAULT_BRANDING.batches,
    classes: Array.isArray(data.classes) ? data.classes : DEFAULT_BRANDING.classes,
    majors: Array.isArray(data.majors) ? data.majors : DEFAULT_BRANDING.majors,
    academic_years: Array.isArray(data.academic_years) ? data.academic_years : DEFAULT_BRANDING.academic_years,
    subjects: Array.isArray(data.subjects) ? data.subjects : DEFAULT_BRANDING.subjects,
    instructors: Array.isArray(data.instructors) ? data.instructors : DEFAULT_BRANDING.instructors,
    rooms: Array.isArray(data.rooms) ? data.rooms : DEFAULT_BRANDING.rooms,
    time_slots: Array.isArray(data.time_slots) ? data.time_slots : DEFAULT_BRANDING.time_slots,
    important_notes: Array.isArray(data.important_notes) ? data.important_notes : DEFAULT_BRANDING.important_notes,
  };
}

async function ensureInitialAdminProvisioned(): Promise<void> {
  if (!supabaseService) return;
  try {
    const { data: listData } = await supabaseService.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find(
      (u) => u.email?.toLowerCase() === REQUESTED_ADMIN_EMAIL
    );
    if (!existing) {
      const { error: createErr } = await supabaseService.auth.admin.createUser({
        email: REQUESTED_ADMIN_EMAIL,
        password: REQUESTED_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Admin Kartu UNIKMA' },
      });
      if (createErr) {
        console.warn('Initial admin auth provision warning:', createErr.message);
      } else {
        console.log(`Provisioned Supabase Auth account: ${REQUESTED_ADMIN_EMAIL}`);
      }
    }

    // Also ensure row exists in public.admins if the table has already been created
    await supabaseService
      .from('admins')
      .upsert(
        {
          email: REQUESTED_ADMIN_EMAIL,
          name: 'Admin Kartu UNIKMA',
          role: 'superadmin',
          added_by: 'system',
        },
        { onConflict: 'email' }
      );
  } catch (err) {
    console.warn('Initial admin bootstrap skipped:', err instanceof Error ? err.message : err);
  }
}

async function ensureAuthUserWithPassword(
  email: string,
  password: string,
  fullName: string
): Promise<{ created: boolean; updated: boolean }> {
  if (!supabaseService) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.');
  }

  const { data: listData, error: listErr } = await supabaseService.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) {
    throw new Error(listErr.message);
  }

  const existing = listData?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    const { error: updErr } = await supabaseService.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata || {}),
        full_name: fullName,
      },
    });
    if (updErr) {
      throw new Error(updErr.message);
    }
    return { created: false, updated: true };
  }

  const { error: createErr } = await supabaseService.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr) {
    throw new Error(createErr.message);
  }
  return { created: true, updated: false };
}

async function confirmExistingAuthUserIfUnconfirmed(email: string): Promise<void> {
  if (!supabaseService) return;
  const { data: listData } = await supabaseService.auth.admin.listUsers({ perPage: 1000 });
  const existing = listData?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing && !existing.email_confirmed_at) {
    await supabaseService.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
    });
  }
}

async function startServer() {
  await ensureInitialAdminProvisioned();
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Public Supabase runtime config (ONLY public URL & Anon key, NEVER Service Role)
  app.get('/api/public-config', (_req, res) => {
    res.json({
      configured: isSupabaseConfigured,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      superAdminEmail: SUPER_ADMIN_EMAIL,
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      supabaseConfigured: isSupabaseConfigured,
      serviceRoleActive: hasServiceRole,
    });
  });

  app.get('/api/setup/schema', (_req, res) => {
    try {
      const sqlPath = path.join(__dirname, 'supabase', 'schema.sql');
      const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf-8') : '';
      res.json({ sql });
    } catch {
      res.status(500).json({ error: 'Gagal membaca file skema SQL.' });
    }
  });

  // Auth status endpoint
  app.get('/api/auth/me', async (req, res) => {
    const ctx = await resolveAuthContext(req);
    if (!ctx) {
      return res.json({
        authenticated: false,
        email: null,
        name: null,
        isSuperAdmin: false,
        isAdmin: false,
        isProctor: false,
        adminInfo: null,
        proctorInfo: null,
      });
    }
    res.json({
      authenticated: true,
      email: ctx.email,
      name: ctx.name,
      isSuperAdmin: ctx.isSuperAdmin,
      isAdmin: ctx.isAdmin,
      isProctor: ctx.isProctor,
      adminInfo: ctx.adminInfo,
      proctorInfo: ctx.proctorInfo,
    });
  });

  // Activate an already-whitelisted Admin/Proctor account that has no confirmed password yet
  app.post('/api/auth/activate-whitelisted', async (req, res) => {
    try {
      const identifier = String(req.body?.identifier || '').trim();
      const password = String(req.body?.password || '').trim();
      const fullName = String(req.body?.fullName || '').trim();
      const email = normalizeAuthIdentifier(identifier);

      if (!email || !password) {
        return res.status(400).json({ error: 'Username/email dan kata sandi wajib diisi.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      }
      if (!supabaseService) {
        return res.status(503).json({
          error: 'Fitur aktivasi akun membutuhkan konfigurasi SUPABASE_SERVICE_ROLE_KEY di server.',
        });
      }

      const [{ data: adminRow }, { data: proctorRow }] = await Promise.all([
        supabaseService.from('admins').select('email, name').eq('email', email).maybeSingle(),
        supabaseService.from('proctors').select('email, name').eq('email', email).maybeSingle(),
      ]);

      const isAuthorized = SUPER_ADMIN_EMAILS.has(email) || Boolean(adminRow) || Boolean(proctorRow);
      if (!isAuthorized) {
        return res.status(403).json({
          error: `Akun "${identifier}" belum didaftarkan oleh Admin Utama di daftar Admin atau Pengawas.`,
        });
      }

      const { data: listData, error: listErr } = await supabaseService.auth.admin.listUsers({
        perPage: 1000,
      });
      if (listErr) return res.status(500).json({ error: listErr.message });

      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (existing && existing.email_confirmed_at) {
        return res.status(409).json({
          error:
            'Akun ini sudah aktif dan memiliki kata sandi. Silakan masuk melalui tab Masuk, atau minta Admin Utama mengatur ulang kata sandi di Panel Admin.',
        });
      }

      const resolvedName =
        fullName ||
        (adminRow?.name as string) ||
        (proctorRow?.name as string) ||
        email.split('@')[0];

      await ensureAuthUserWithPassword(email, password, resolvedName);
      res.json({ activated: true, email });
    } catch (err) {
      console.error('Activate whitelisted error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal mengaktifkan akun terdaftar.',
      });
    }
  });

  // ========================================================================
  // PUBLIC STUDENT ENDPOINTS
  // ========================================================================

  app.get('/api/student/bootstrap', async (_req, res) => {
    try {
      const db = getDbClient();
      const branding = await loadBranding(db);
      res.json({
        configured: isSupabaseConfigured,
        branding,
      });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.json({ configured: isSupabaseConfigured, branding: DEFAULT_BRANDING });
    }
  });

  app.get('/api/student/lookup', async (req, res) => {
    const nim = String(req.query.nim || '').trim();
    if (!nim) {
      return res.status(400).json({ error: 'NIM wajib diisi.' });
    }
    if (!isSupabaseConfigured) {
      return res.status(503).json({
        error: 'Supabase belum dikonfigurasi. Gunakan Mode Simulasi atau atur koneksi Supabase.',
        notConfigured: true,
      });
    }

    try {
      const db = getDbClient();
      if (!db) throw new Error('Database client unavailable');

      const { data: student, error } = await db
        .from('students')
        .select('*')
        .ilike('nim', nim)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      if (!student) {
        return res.status(404).json({ error: `NIM ${nim} tidak ditemukan dalam data mahasiswa.` });
      }

      const typed = student as Student;
      res.json({
        student: typed,
        status: getStudentPrintStatus(typed),
      });
    } catch (err) {
      console.error('Student lookup error:', err);
      res.status(500).json({ error: 'Terjadi kesalahan saat mencari data mahasiswa.' });
    }
  });

  app.get('/api/student/schedule', async (req, res) => {
    const classId = String(req.query.classId || '').trim();
    const batchId = String(req.query.batchId || '').trim();
    const academicYear = String(req.query.academicYear || '').trim();

    if (!classId || !batchId || !academicYear) {
      return res.status(400).json({ error: 'Parameter kelas, angkatan, dan tahun akademik diperlukan.' });
    }
    if (!isSupabaseConfigured) {
      return res.json({ schedule: null });
    }

    try {
      const db = getDbClient();
      if (!db) return res.json({ schedule: null });

      const scheduleId = `${classId}_${batchId}_${academicYear}`;
      const { data, error } = await db
        .from('schedules')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ schedule: (data as ExamSchedule) || null });
    } catch (err) {
      console.error('Schedule fetch error:', err);
      res.status(500).json({ error: 'Gagal mengambil jadwal ujian.' });
    }
  });

  app.post('/api/student/downloaded', async (req, res) => {
    const nim = String(req.body?.nim || '').trim();
    const isSimulation = Boolean(req.body?.isSimulation);

    if (isSimulation) {
      return res.json({ last_downloaded_at: new Date().toISOString(), simulated: true });
    }
    if (!nim) {
      return res.status(400).json({ error: 'NIM diperlukan.' });
    }
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase belum dikonfigurasi.' });
    }

    try {
      const db = getDbClient();
      if (!db) throw new Error('Database client unavailable');

      const { data: student, error: findErr } = await db
        .from('students')
        .select('nim, can_print')
        .eq('nim', nim)
        .maybeSingle();

      if (findErr || !student) {
        return res.status(404).json({ error: 'Data mahasiswa tidak ditemukan.' });
      }
      if (!student.can_print) {
        return res.status(403).json({ error: 'Cetak kartu untuk NIM ini sedang diblokir.' });
      }

      const now = new Date().toISOString();
      const { error: updateErr } = await db
        .from('students')
        .update({ last_downloaded_at: now })
        .eq('nim', nim);

      if (updateErr) {
        return res.status(500).json({ error: updateErr.message });
      }

      res.json({ last_downloaded_at: now });
    } catch (err) {
      console.error('Record download error:', err);
      res.status(500).json({ error: 'Gagal mencatat waktu unduhan kartu.' });
    }
  });

  // Server-side Mode Simulasi endpoint
  app.post('/api/student/simulate', async (req, res) => {
    try {
      const examType: ExamType = req.body?.examType === 'UAS' ? 'UAS' : 'UTS';
      const blocked = Boolean(req.body?.blocked);
      const db = getDbClient();
      const branding = await loadBranding(db);

      const batch = branding.batches[branding.batches.length - 1] || '2024';
      const className = branding.classes[0] || 'TI-A';
      const academicYear = branding.academic_years[branding.academic_years.length - 1] || '2026/2027 Ganjil';
      const facultyObj = branding.faculties[0];
      const faculty = facultyObj?.name || 'Fakultas Teknologi Informasi';
      const major = facultyObj?.majors?.[0] || branding.majors[0] || 'Teknik Informatika';

      const simulatedStudent: Student = {
        nim: blocked ? '202401999' : '202401001',
        name: blocked ? 'Rizky Ramadhan (Simulasi Blokir)' : 'Bagas Pratama Putra (Simulasi)',
        faculty,
        major,
        class_name: className,
        campus: branding.campus_name,
        batch,
        can_print: !blocked,
        student_type: 'Reguler',
        last_downloaded_at: null,
      };

      const simulatedSchedule: ExamSchedule = {
        id: `${className}_${batch}_${academicYear}`,
        class_id: className,
        batch_id: batch,
        academic_year: academicYear,
        campus: branding.campus_name,
        major,
        schedules: [
          {
            code: branding.subjects[0]?.code || 'IF301',
            subject: branding.subjects[0]?.name || 'Algoritma & Struktur Data',
            instructor: branding.instructors[0] || 'Ahmad Fauzi, M.Kom.',
            day: 'Senin',
            date: '2026-11-23',
            time: branding.time_slots[0] || '08:00 - 09:30',
            room: branding.rooms[0] || 'R. 101',
            sks: branding.subjects[0]?.sks || 3,
          },
          {
            code: branding.subjects[1]?.code || 'IF302',
            subject: branding.subjects[1]?.name || 'Basis Data Lanjut',
            instructor: branding.instructors[1] || 'Rina Kusuma, S.Kom., M.T.',
            day: 'Selasa',
            date: '2026-11-24',
            time: branding.time_slots[1] || '10:00 - 11:30',
            room: branding.rooms[2] || 'Lab Komputer 1',
            sks: branding.subjects[1]?.sks || 3,
          },
          {
            code: branding.subjects[2]?.code || 'IF303',
            subject: branding.subjects[2]?.name || 'Rekayasa Perangkat Lunak',
            instructor: branding.instructors[2] || 'Budi Santoso, M.Cs.',
            day: 'Rabu',
            date: '2026-11-25',
            time: branding.time_slots[0] || '08:00 - 09:30',
            room: branding.rooms[1] || 'R. 102',
            sks: branding.subjects[2]?.sks || 3,
          },
          {
            code: branding.subjects[3]?.code || 'IF304',
            subject: branding.subjects[3]?.name || 'Jaringan Komputer',
            instructor: branding.instructors[3] || 'Dewi Lestari, S.T., M.Kom.',
            day: 'Kamis',
            date: '2026-11-26',
            time: branding.time_slots[2] || '13:00 - 14:30',
            room: branding.rooms[3] || 'Lab Komputer 2',
            sks: branding.subjects[3]?.sks || 3,
          },
        ],
      };

      res.json({
        isSimulation: true,
        student: simulatedStudent,
        schedule: simulatedSchedule,
        examType,
      });
    } catch (err) {
      console.error('Simulate error:', err);
      res.status(500).json({ error: 'Gagal memuat mode simulasi.' });
    }
  });

  // ========================================================================
  // PROCTOR ENDPOINTS (Verified Google OAuth + proctors/admins table)
  // ========================================================================

  app.get('/api/proctor/session-data', requireProctorOrAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const examType = String(req.query.examType || 'UTS');
      const academicYear = String(req.query.academicYear || '');
      const className = String(req.query.className || '');
      const subjectCode = String(req.query.subjectCode || '');
      const room = String(req.query.room || '');

      const branding = await loadBranding(db);

      let studentsQuery = db.from('students').select('*').order('nim', { ascending: true });
      if (className && className !== 'ALL') {
        studentsQuery = studentsQuery.eq('class_name', className);
      }

      let schedulesQuery = db.from('schedules').select('*');
      if (academicYear) {
        schedulesQuery = schedulesQuery.eq('academic_year', academicYear);
      }

      let attendanceQuery = db
        .from('exam_attendance')
        .select('*')
        .eq('exam_type', examType)
        .order('verified_at', { ascending: false });

      if (academicYear) attendanceQuery = attendanceQuery.eq('academic_year', academicYear);
      if (className && className !== 'ALL') attendanceQuery = attendanceQuery.eq('class_name', className);
      if (subjectCode && subjectCode !== 'ALL') attendanceQuery = attendanceQuery.eq('subject_code', subjectCode);
      if (room && room !== 'ALL') attendanceQuery = attendanceQuery.eq('room', room);

      const [studentsRes, schedulesRes, attendanceRes] = await Promise.all([
        studentsQuery,
        schedulesQuery,
        attendanceQuery,
      ]);

      if (studentsRes.error) return res.status(500).json({ error: studentsRes.error.message });
      if (schedulesRes.error) return res.status(500).json({ error: schedulesRes.error.message });
      if (attendanceRes.error) return res.status(500).json({ error: attendanceRes.error.message });

      res.json({
        branding,
        students: studentsRes.data || [],
        schedules: schedulesRes.data || [],
        attendance: attendanceRes.data || [],
      });
    } catch (err) {
      console.error('Proctor session-data error:', err);
      res.status(500).json({ error: 'Gagal memuat data sesi ujian.' });
    }
  });

  app.post('/api/proctor/verify-card', requireProctorOrAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const rawInput = String(req.body?.code || '').trim();
      const activeExamType: ExamType = req.body?.examType === 'UAS' ? 'UAS' : 'UTS';
      const activeAcademicYear = String(req.body?.academicYear || '').trim();
      const activeSubjectCode = String(req.body?.subjectCode || '').trim();

      if (!rawInput) {
        return res.status(400).json({ error: 'Kode QR atau NIM tidak boleh kosong.' });
      }

      const parsed = parseQrOrNimInput(rawInput);
      const { data: student, error: studentErr } = await db
        .from('students')
        .select('*')
        .ilike('nim', parsed.nim)
        .maybeSingle();

      if (studentErr) return res.status(500).json({ error: studentErr.message });
      if (!student) {
        return res.status(404).json({
          valid: false,
          reason: `NIM "${parsed.nim}" tidak terdaftar di database mahasiswa.`,
        });
      }

      const typedStudent = student as Student;
      const scheduleId = `${typedStudent.class_name}_${typedStudent.batch}_${activeAcademicYear}`;
      const { data: schedule } = await db
        .from('schedules')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();

      const typedSchedule = schedule as ExamSchedule | null;
      const examTypeMatch = !parsed.examTypeFromQr || parsed.examTypeFromQr === activeExamType;
      const matchedSubject =
        activeSubjectCode && activeSubjectCode !== 'ALL'
          ? typedSchedule?.schedules?.find((s) => s.code.toLowerCase() === activeSubjectCode.toLowerCase()) || null
          : null;

      res.json({
        valid: typedStudent.can_print && examTypeMatch,
        isBlocked: !typedStudent.can_print,
        examTypeMismatch: !examTypeMatch,
        scannedExamType: parsed.examTypeFromQr,
        isFormattedQr: parsed.isFormattedQr,
        student: typedStudent,
        schedule: typedSchedule,
        matchedSubject,
      });
    } catch (err) {
      console.error('Verify card error:', err);
      res.status(500).json({ error: 'Gagal memverifikasi kartu ujian.' });
    }
  });

  app.post('/api/proctor/attendance', requireProctorOrAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const {
        nim,
        student_name,
        major,
        class_name,
        batch,
        exam_type,
        academic_year,
        subject_code,
        subject_name,
        room,
        status,
        card_verified,
        note,
      } = req.body || {};

      if (!nim || !exam_type || !academic_year || !subject_code || !status) {
        return res.status(400).json({ error: 'Data presensi tidak lengkap (NIM, jenis ujian, tahun akademik, mata kuliah, dan status wajib diisi).' });
      }

      const allowedStatuses: AttendanceStatus[] = ['Hadir', 'Izin', 'Tidak Hadir'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status kehadiran tidak valid.' });
      }

      const id = `${nim}_${exam_type}_${academic_year}_${subject_code}`;
      const record = {
        id,
        nim: String(nim),
        student_name: String(student_name || ''),
        major: String(major || ''),
        class_name: String(class_name || ''),
        batch: String(batch || ''),
        exam_type: exam_type === 'UAS' ? 'UAS' : 'UTS',
        academic_year: String(academic_year),
        subject_code: String(subject_code),
        subject_name: String(subject_name || subject_code),
        room: String(room || ''),
        status,
        card_verified: Boolean(card_verified),
        note: String(note || ''),
        proctor_email: req.authContext!.email,
        proctor_name: req.authContext!.name,
        verified_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('exam_attendance')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ attendance: data });
    } catch (err) {
      console.error('Attendance save error:', err);
      res.status(500).json({ error: 'Gagal menyimpan data kehadiran ujian.' });
    }
  });

  // ========================================================================
  // ADMIN ENDPOINTS (Verified Google OAuth + admins table / Super Admin)
  // ========================================================================

  app.get('/api/admin/overview', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const [branding, studentsRes, schedulesRes, adminsRes, proctorsRes] = await Promise.all([
        loadBranding(db),
        db.from('students').select('*').order('nim', { ascending: true }),
        db.from('schedules').select('*').order('id', { ascending: true }),
        db.from('admins').select('*').order('added_at', { ascending: true }),
        db.from('proctors').select('*').order('added_at', { ascending: true }),
      ]);

      if (studentsRes.error) return res.status(500).json({ error: studentsRes.error.message });
      if (schedulesRes.error) return res.status(500).json({ error: schedulesRes.error.message });
      if (adminsRes.error) return res.status(500).json({ error: adminsRes.error.message });
      if (proctorsRes.error) return res.status(500).json({ error: proctorsRes.error.message });

      const authStatusMap: Record<string, UserAuthStatus> = {};
      if (supabaseService) {
        const { data: listData } = await supabaseService.auth.admin.listUsers({ perPage: 1000 });
        const userMap = new Map(
          (listData?.users || []).map((u) => [
            (u.email || '').toLowerCase(),
            Boolean(u.email_confirmed_at),
          ])
        );
        const allEmails = [
          ...(adminsRes.data || []).map((a) => String(a.email || '').toLowerCase()),
          ...(proctorsRes.data || []).map((p) => String(p.email || '').toLowerCase()),
        ];
        for (const em of allEmails) {
          if (!em) continue;
          if (!userMap.has(em)) {
            authStatusMap[em] = 'no_auth';
          } else if (!userMap.get(em)) {
            authStatusMap[em] = 'unconfirmed';
          } else {
            authStatusMap[em] = 'active';
          }
        }
      }

      res.json({
        branding,
        students: studentsRes.data || [],
        schedules: schedulesRes.data || [],
        admins: adminsRes.data || [],
        proctors: proctorsRes.data || [],
        authStatusMap,
      });
    } catch (err) {
      console.error('Admin overview error:', err);
      res.status(500).json({ error: 'Gagal memuat data panel admin.' });
    }
  });

  // Admin: Students CRUD & Bulk Actions
  app.post('/api/admin/students', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const payload = req.body as Partial<Student>;
      if (!payload.nim || !payload.name) {
        return res.status(400).json({ error: 'NIM dan Nama mahasiswa wajib diisi.' });
      }

      const major = String(payload.major || '').trim();
      const rawFaculty = String(payload.faculty || '').trim();
      const resolvedFaculty =
        rawFaculty || resolveFacultyForMajor(major, CANONICAL_FACULTIES)?.name || '';

      const row = {
        nim: String(payload.nim).trim(),
        name: String(payload.name).trim(),
        faculty: resolvedFaculty,
        major,
        class_name: String(payload.class_name || '').trim(),
        campus: String(payload.campus || 'Kampus Utama').trim(),
        batch: String(payload.batch || '').trim(),
        can_print: payload.can_print !== undefined ? Boolean(payload.can_print) : true,
        student_type: String(payload.student_type || 'Reguler').trim(),
        last_downloaded_at: payload.last_downloaded_at || null,
      };

      const { data, error } = await db
        .from('students')
        .upsert(row, { onConflict: 'nim' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ student: data });
    } catch (err) {
      console.error('Save student error:', err);
      res.status(500).json({ error: 'Gagal menyimpan data mahasiswa.' });
    }
  });

  app.put('/api/admin/students/:nim', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const nim = req.params.nim;
      const updates: Record<string, unknown> = {};
      const allowed = ['name', 'faculty', 'major', 'class_name', 'campus', 'batch', 'can_print', 'student_type', 'last_downloaded_at'];
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }

      const { data, error } = await db
        .from('students')
        .update(updates)
        .eq('nim', nim)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ student: data });
    } catch (err) {
      console.error('Update student error:', err);
      res.status(500).json({ error: 'Gagal memperbarui mahasiswa.' });
    }
  });

  app.delete('/api/admin/students/:nim', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const { error } = await db.from('students').delete().eq('nim', req.params.nim);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete student error:', err);
      res.status(500).json({ error: 'Gagal menghapus mahasiswa.' });
    }
  });

  app.post('/api/admin/students/bulk-import', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const rows = Array.isArray(req.body?.students) ? req.body.students : [];
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Tidak ada baris data mahasiswa untuk diimpor.' });
      }

      const cleaned = rows
        .filter((r: Partial<Student>) => r.nim && r.name)
        .map((r: Partial<Student>) => {
          const major = String(r.major || '').trim();
          const rawFaculty = String(r.faculty || '').trim();
          const resolvedFaculty =
            resolveFacultyForMajor(major, CANONICAL_FACULTIES)?.name ||
            normalizeFacultyName(rawFaculty);
          return {
            nim: String(r.nim).trim(),
            name: String(r.name).trim(),
            faculty: resolvedFaculty,
            major,
            class_name: String(r.class_name || '').trim(),
            campus: String(r.campus || 'Kampus Utama').trim(),
            batch: String(r.batch || '').trim(),
            can_print: r.can_print !== undefined ? Boolean(r.can_print) : true,
            student_type: String(r.student_type || 'Reguler').trim(),
          };
        });

      const { data, error } = await db
        .from('students')
        .upsert(cleaned, { onConflict: 'nim' })
        .select();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ importedCount: data?.length || cleaned.length, students: data || [] });
    } catch (err) {
      console.error('Bulk import students error:', err);
      res.status(500).json({ error: 'Gagal mengimpor data mahasiswa.' });
    }
  });

  app.post('/api/admin/students/bulk-action', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const action = String(req.body?.action || '');

      if (action === 'unblock_all') {
        const { error } = await db.from('students').update({ can_print: true }).neq('nim', '');
        if (error) return res.status(500).json({ error: error.message });
      } else if (action === 'block_all') {
        const { error } = await db.from('students').update({ can_print: false }).neq('nim', '');
        if (error) return res.status(500).json({ error: error.message });
      } else if (action === 'reset_downloads') {
        const { error } = await db.from('students').update({ last_downloaded_at: null }).neq('nim', '');
        if (error) return res.status(500).json({ error: error.message });
      } else if (action === 'delete_all') {
        const { error } = await db.from('students').delete().neq('nim', '');
        if (error) return res.status(500).json({ error: error.message });
      } else {
        return res.status(400).json({ error: 'Aksi massal tidak dikenal.' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Bulk action error:', err);
      res.status(500).json({ error: 'Gagal menjalankan aksi massal.' });
    }
  });

  // Admin: Branding & Master Data
  app.put('/api/admin/branding', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const payload = {
        ...req.body,
        id: 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('branding')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ branding: data });
    } catch (err) {
      console.error('Update branding error:', err);
      res.status(500).json({ error: 'Gagal menyimpan konfigurasi master dan pengaturan.' });
    }
  });

  // Admin: Import / Restore JSON Backup (Firestore or Portal JSON)
  app.post('/api/admin/import-backup', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const rawBackup = req.body?.backup;
      if (!rawBackup || typeof rawBackup !== 'object') {
        return res.status(400).json({ error: 'Payload backup JSON tidak valid.' });
      }

      const opts: BackupImportOptions = {
        importStudents: Boolean(req.body?.options?.importStudents),
        importSchedules: Boolean(req.body?.options?.importSchedules),
        importMasterData: Boolean(req.body?.options?.importMasterData),
        importIdentity: Boolean(req.body?.options?.importIdentity),
        preserveSunsetColors:
          req.body?.options?.preserveSunsetColors !== undefined
            ? Boolean(req.body.options.preserveSunsetColors)
            : true,
        importUsers: Boolean(req.body?.options?.importUsers),
        importAttendance: Boolean(req.body?.options?.importAttendance),
      };

      const parsed = parseBackupJsonPayload(rawBackup);
      const summary = {
        students: 0,
        schedules: 0,
        admins: 0,
        proctors: 0,
        attendance: 0,
        masterUpdated: false,
        identityUpdated: false,
      };

      // 1. Students (chunked upsert by 200)
      if (opts.importStudents && parsed.students.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < parsed.students.length; i += chunkSize) {
          const slice = parsed.students.slice(i, i + chunkSize).map((s) => ({
            ...s,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await db.from('students').upsert(slice, { onConflict: 'nim' });
          if (error) return res.status(500).json({ error: `Gagal impor mahasiswa: ${error.message}` });
          summary.students += slice.length;
        }
      }

      // 2. Schedules (chunked upsert by 50)
      if (opts.importSchedules && parsed.schedules.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < parsed.schedules.length; i += chunkSize) {
          const slice = parsed.schedules.slice(i, i + chunkSize).map((sc) => ({
            ...sc,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await db.from('schedules').upsert(slice, { onConflict: 'id' });
          if (error) return res.status(500).json({ error: `Gagal impor jadwal: ${error.message}` });
          summary.schedules += slice.length;
        }
      }

      // 3. Admins & Proctors (upsert without overwriting protected superadmin roles)
      if (opts.importUsers) {
        if (parsed.admins.length > 0) {
          const adminRows = parsed.admins.map((a) => ({
            ...a,
            role: SUPER_ADMIN_EMAILS.has(a.email) ? 'superadmin' : a.role,
          }));
          const { error } = await db.from('admins').upsert(adminRows, { onConflict: 'email' });
          if (error) return res.status(500).json({ error: `Gagal impor admin: ${error.message}` });
          summary.admins = adminRows.length;
        }
        if (parsed.proctors.length > 0) {
          const { error } = await db.from('proctors').upsert(parsed.proctors, { onConflict: 'email' });
          if (error) return res.status(500).json({ error: `Gagal impor pengawas: ${error.message}` });
          summary.proctors = parsed.proctors.length;
        }
      }

      // 4. Exam Attendance
      if (opts.importAttendance && parsed.attendance.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < parsed.attendance.length; i += chunkSize) {
          const slice = parsed.attendance.slice(i, i + chunkSize);
          const { error } = await db.from('exam_attendance').upsert(slice, { onConflict: 'id' });
          if (error) return res.status(500).json({ error: `Gagal impor presensi: ${error.message}` });
          summary.attendance += slice.length;
        }
      }

      // 5. Branding (Master Data and/or Identity)
      let latestBranding = await loadBranding(db);
      if (
        (opts.importMasterData && parsed.masterData) ||
        (opts.importIdentity && parsed.identityData)
      ) {
        const mergedPayload: Record<string, unknown> = {
          ...latestBranding,
          id: 1,
          updated_at: new Date().toISOString(),
        };

        if (opts.importMasterData && parsed.masterData) {
          Object.assign(mergedPayload, parsed.masterData);
          summary.masterUpdated = true;
        }

        if (opts.importIdentity && parsed.identityData) {
          Object.assign(mergedPayload, {
            ...parsed.identityData,
            primary_color: opts.preserveSunsetColors
              ? latestBranding.primary_color
              : parsed.identityData.primary_color,
            secondary_color: opts.preserveSunsetColors
              ? latestBranding.secondary_color
              : parsed.identityData.secondary_color,
          });
          summary.identityUpdated = true;
        }

        const { data: savedBranding, error: brandErr } = await db
          .from('branding')
          .upsert(mergedPayload, { onConflict: 'id' })
          .select()
          .single();

      if (brandErr) {
          return res.status(500).json({ error: `Gagal impor data master/pengaturan: ${brandErr.message}` });
        }
        if (savedBranding) {
          latestBranding = savedBranding as BrandingConfig;
        }
      }

      res.json({
        imported: summary,
        branding: latestBranding,
      });
    } catch (err) {
      console.error('Import backup error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal mengimpor file backup database.',
      });
    }
  });

  // Admin: Apply canonical Faculty <-> Major grouping & sync student rows
  app.post('/api/admin/sync-faculty-mapping', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const currentBranding = await loadBranding(db);
      const nextFaculties = CANONICAL_FACULTIES.map((canon) => {
        const existing = currentBranding.faculties.find(
          (f) =>
            f.id === canon.id ||
            normalizeFacultyName(f.name).toLowerCase() === canon.name.toLowerCase()
        );
        return {
          ...canon,
          deanName: existing?.deanName || canon.deanName,
          deanNidn: existing?.deanNidn || canon.deanNidn,
        };
      });

      const mergedMajors = Array.from(
        new Set([
          ...CANONICAL_MAJORS,
          ...(currentBranding.majors || []).filter((m) => Boolean(String(m).trim())),
        ])
      );

      const brandingPayload = {
        ...currentBranding,
        id: 1,
        faculties: nextFaculties,
        majors: mergedMajors,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedBranding, error: brandErr } = await db
        .from('branding')
        .upsert(brandingPayload, { onConflict: 'id' })
        .select()
        .single();

      if (brandErr) return res.status(500).json({ error: brandErr.message });

      const { data: allStudents, error: stuErr } = await db.from('students').select('*');
      if (stuErr) return res.status(500).json({ error: stuErr.message });

      const updates: Record<string, unknown>[] = [];
      for (const s of (allStudents || []) as Student[]) {
        const matched = resolveFacultyForMajor(s.major, nextFaculties);
        const nextFaculty = matched?.name || normalizeFacultyName(s.faculty);
        if (nextFaculty && nextFaculty !== s.faculty) {
          updates.push({
            ...s,
            faculty: nextFaculty,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (updates.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < updates.length; i += chunkSize) {
          const { error: upErr } = await db
            .from('students')
            .upsert(updates.slice(i, i + chunkSize), { onConflict: 'nim' });
          if (upErr) return res.status(500).json({ error: upErr.message });
        }
      }

      res.json({
        branding: updatedBranding || brandingPayload,
        updatedStudentsCount: updates.length,
      });
    } catch (err) {
      console.error('Sync faculty mapping error:', err);
      res.status(500).json({ error: 'Gagal menyinkronkan pengelompokan fakultas dan prodi.' });
    }
  });

  // Admin: Schedules
  app.post('/api/admin/schedules', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const { class_id, batch_id, academic_year, campus, major, schedules } = req.body || {};
      if (!class_id || !batch_id || !academic_year) {
        return res.status(400).json({ error: 'Kelas, Angkatan, dan Tahun Akademik wajib diisi.' });
      }

      const id = `${String(class_id).trim()}_${String(batch_id).trim()}_${String(academic_year).trim()}`;
      const normalizedSchedules = Array.isArray(schedules)
        ? schedules.map((item) => ({
            ...item,
            date: normalizeExamDate(item?.date) || item?.date || '-',
          }))
        : [];

      const row = {
        id,
        class_id: String(class_id).trim(),
        batch_id: String(batch_id).trim(),
        academic_year: String(academic_year).trim(),
        campus: String(campus || 'Kampus Utama').trim(),
        major: String(major || '').trim(),
        schedules: normalizedSchedules,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('schedules')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ schedule: data });
    } catch (err) {
      console.error('Save schedule error:', err);
      res.status(500).json({ error: 'Gagal menyimpan jadwal ujian.' });
    }
  });

  app.post('/api/admin/schedules/bulk-import', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const rawItems = Array.isArray(req.body?.schedules) ? req.body.schedules : [];
      if (rawItems.length === 0) {
        return res.status(400).json({ error: 'Tidak ada data jadwal untuk diimpor.' });
      }

      const items = rawItems.map((pkg: Partial<ExamSchedule>) => ({
        ...pkg,
        schedules: Array.isArray(pkg.schedules)
          ? pkg.schedules.map((item) => ({
              ...item,
              date: normalizeExamDate(item?.date) || item?.date || '-',
            }))
          : [],
      }));

      const { data, error } = await db
        .from('schedules')
        .upsert(items, { onConflict: 'id' })
        .select();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ schedules: data || [] });
    } catch (err) {
      console.error('Bulk import schedules error:', err);
      res.status(500).json({ error: 'Gagal mengimpor jadwal ujian.' });
    }
  });

  app.delete('/api/admin/schedules/:id', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const { error } = await db.from('schedules').delete().eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete schedule error:', err);
      res.status(500).json({ error: 'Gagal menghapus jadwal.' });
    }
  });

  // Admin: Admins Management
  app.post('/api/admin/admins', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const email = normalizeAuthIdentifier(String(req.body?.email || ''));
      const name = String(req.body?.name || '').trim();
      const role = req.body?.role === 'superadmin' ? 'superadmin' : 'admin';
      const password = String(req.body?.password || '').trim();

      if (!email || !name) {
        return res.status(400).json({ error: 'Username/Email dan Nama Admin wajib diisi.' });
      }

      if (password && password.length < 6) {
        return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      }

      let authProvisioned = false;
      if (password) {
        try {
          await ensureAuthUserWithPassword(email, password, name);
          authProvisioned = true;
        } catch (authErr) {
          return res.status(400).json({
            error: `Gagal membuat/mengatur kata sandi Auth: ${
              authErr instanceof Error ? authErr.message : 'Error tidak diketahui'
            }`,
          });
        }
      } else {
        await confirmExistingAuthUserIfUnconfirmed(email);
      }

      const row = {
        email,
        name,
        role: SUPER_ADMIN_EMAILS.has(email) ? 'superadmin' : role,
        added_at: new Date().toISOString(),
        added_by: req.authContext!.email,
      };

      const { data, error } = await db
        .from('admins')
        .upsert(row, { onConflict: 'email' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ admin: data, authProvisioned });
    } catch (err) {
      console.error('Add admin error:', err);
      res.status(500).json({ error: 'Gagal menyimpan data admin.' });
    }
  });

  app.post('/api/admin/users/set-password', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const email = normalizeAuthIdentifier(String(req.body?.email || ''));
      const password = String(req.body?.password || '').trim();
      const name = String(req.body?.name || '').trim() || email.split('@')[0];

      if (!email) {
        return res.status(400).json({ error: 'Username/email wajib diisi.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      }

      const result = await ensureAuthUserWithPassword(email, password, name);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('Set user password error:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal mengatur kata sandi pengguna.',
      });
    }
  });

  app.delete('/api/admin/admins/:email', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const targetEmail = normalizeAuthIdentifier(String(req.params.email || ''));
      if (SUPER_ADMIN_EMAILS.has(targetEmail)) {
        return res.status(403).json({ error: 'Super Admin utama tidak dapat dihapus.' });
      }

      const { error } = await db.from('admins').delete().eq('email', targetEmail);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete admin error:', err);
      res.status(500).json({ error: 'Gagal menghapus admin.' });
    }
  });

  // Admin: Proctors Management
  app.post('/api/admin/proctors', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const email = normalizeAuthIdentifier(String(req.body?.email || ''));
      const name = String(req.body?.name || '').trim();
      const assigned_room = String(req.body?.assigned_room || '').trim();
      const faculty = String(req.body?.faculty || '').trim();
      const password = String(req.body?.password || '').trim();

      if (!email || !name) {
        return res.status(400).json({ error: 'Username/Email dan Nama Pengawas wajib diisi.' });
      }

      if (password && password.length < 6) {
        return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      }

      let authProvisioned = false;
      if (password) {
        try {
          await ensureAuthUserWithPassword(email, password, name);
          authProvisioned = true;
        } catch (authErr) {
          return res.status(400).json({
            error: `Gagal membuat/mengatur kata sandi Auth: ${
              authErr instanceof Error ? authErr.message : 'Error tidak diketahui'
            }`,
          });
        }
      } else {
        await confirmExistingAuthUserIfUnconfirmed(email);
      }

      const row = {
        email,
        name,
        assigned_room,
        faculty,
        added_at: new Date().toISOString(),
        added_by: req.authContext!.email,
      };

      const { data, error } = await db
        .from('proctors')
        .upsert(row, { onConflict: 'email' })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ proctor: data, authProvisioned });
    } catch (err) {
      console.error('Save proctor error:', err);
      res.status(500).json({ error: 'Gagal menyimpan data pengawas ujian.' });
    }
  });

  app.delete('/api/admin/proctors/:email', requireAdmin, async (req: VerifiedRequest, res) => {
    try {
      const db = getDbClient(req.authContext!.token);
      if (!db) return res.status(503).json({ error: 'Database belum terhubung.' });

      const targetEmail = String(req.params.email || '').trim().toLowerCase();
      const { error } = await db.from('proctors').delete().eq('email', targetEmail);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete proctor error:', err);
      res.status(500).json({ error: 'Gagal menghapus pengawas.' });
    }
  });

  // Vite Dev Middleware or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Portal Kartu Ujian server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
