-- ============================================================================
-- SISTEM INFORMASI DISTRIBUSI KARTU UJIAN (UTS & UAS)
-- Complete PostgreSQL Schema, Helper Functions, Row Level Security (RLS), & Seed
-- Jalankan script ini di Supabase SQL Editor.
-- ============================================================================

-- 1. TABEL DATA UTAMA
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.students (
  nim TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  faculty TEXT NOT NULL DEFAULT '',
  major TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  campus TEXT NOT NULL DEFAULT 'Kampus Utama',
  batch TEXT NOT NULL DEFAULT '',
  can_print BOOLEAN NOT NULL DEFAULT TRUE,
  student_type TEXT NOT NULL DEFAULT 'Reguler',
  last_downloaded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_class_batch ON public.students (class_name, batch);
CREATE INDEX IF NOT EXISTS idx_students_faculty ON public.students (faculty);

CREATE TABLE IF NOT EXISTS public.schedules (
  id TEXT PRIMARY KEY, -- format: classId_batchId_academicYear
  class_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  campus TEXT NOT NULL DEFAULT 'Kampus Utama',
  major TEXT NOT NULL DEFAULT '',
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_lookup ON public.schedules (class_id, batch_id, academic_year);

CREATE TABLE IF NOT EXISTS public.branding (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  campus_name TEXT NOT NULL DEFAULT 'STMIK Komputama Majenang',
  motto TEXT NOT NULL DEFAULT 'Unggul dalam Teknologi Informasi dan Inovasi Bisnis Digital',
  primary_color TEXT NOT NULL DEFAULT '#EA6113',
  secondary_color TEXT NOT NULL DEFAULT '#F88F22',
  logo_url TEXT NOT NULL DEFAULT '',
  faculties JSONB NOT NULL DEFAULT '[]'::jsonb,
  batches JSONB NOT NULL DEFAULT '[]'::jsonb,
  classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  majors JSONB NOT NULL DEFAULT '[]'::jsonb,
  academic_years JSONB NOT NULL DEFAULT '[]'::jsonb,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructors JSONB NOT NULL DEFAULT '[]'::jsonb,
  rooms JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  important_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  signatory_name TEXT NOT NULL DEFAULT 'Dr. Ahmad Fauzi, M.Kom.',
  signatory_role TEXT NOT NULL DEFAULT 'Ketua Panitia Ujian',
  footer_copyright TEXT NOT NULL DEFAULT 'Panitia Ujian Akademik — Sistem Distribusi Kartu Ujian',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS public.proctors (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  name TEXT NOT NULL,
  assigned_room TEXT NOT NULL DEFAULT '',
  faculty TEXT NOT NULL DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS public.exam_attendance (
  id TEXT PRIMARY KEY, -- format: nim_examType_academicYear_subjectCode
  nim TEXT NOT NULL,
  student_name TEXT NOT NULL,
  major TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  batch TEXT NOT NULL DEFAULT '',
  exam_type TEXT NOT NULL CHECK (exam_type IN ('UTS', 'UAS')),
  academic_year TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Hadir', 'Izin', 'Tidak Hadir')),
  card_verified BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  proctor_email TEXT NOT NULL,
  proctor_name TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.exam_attendance (exam_type, academic_year, subject_code, room);
CREATE INDEX IF NOT EXISTS idx_attendance_nim ON public.exam_attendance (nim);

-- 2. FUNGSI HELPER RLS & KEAMANAN
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_jwt_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'service_role'
    OR public.current_jwt_email() IN ('muhtyas.yugioh@gmail.com', 'adminkartuunikma@unikma.local')
    OR EXISTS (
      SELECT 1 FROM public.admins
      WHERE lower(email) = public.current_jwt_email()
        AND role = 'superadmin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'service_role'
    OR public.current_jwt_email() IN ('muhtyas.yugioh@gmail.com', 'adminkartuunikma@unikma.local')
    OR EXISTS (
      SELECT 1 FROM public.admins
      WHERE lower(email) = public.current_jwt_email()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_proctor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.proctors
      WHERE lower(email) = public.current_jwt_email()
    );
$$;

-- Trigger untuk memastikan user publik (non-admin) HANYA dapat memperbarui last_downloaded_at
CREATE OR REPLACE FUNCTION public.guard_public_student_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.nim IS DISTINCT FROM OLD.nim
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.faculty IS DISTINCT FROM OLD.faculty
       OR NEW.major IS DISTINCT FROM OLD.major
       OR NEW.class_name IS DISTINCT FROM OLD.class_name
       OR NEW.campus IS DISTINCT FROM OLD.campus
       OR NEW.batch IS DISTINCT FROM OLD.batch
       OR NEW.can_print IS DISTINCT FROM OLD.can_print
       OR NEW.student_type IS DISTINCT FROM OLD.student_type THEN
      RAISE EXCEPTION 'Unauthorized modification of student master fields';
    END IF;
    IF OLD.can_print = FALSE THEN
      RAISE EXCEPTION 'Printing is blocked for this student';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_public_student_update ON public.students;
CREATE TRIGGER trg_guard_public_student_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_public_student_update();

-- RPC aman untuk mencatat unduhan kartu oleh mahasiswa publik
CREATE OR REPLACE FUNCTION public.record_card_download(p_nim TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_can_print BOOLEAN;
BEGIN
  SELECT can_print INTO v_can_print FROM public.students WHERE nim = p_nim;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mahasiswa tidak ditemukan';
  END IF;
  IF v_can_print = FALSE THEN
    RAISE EXCEPTION 'Cetak kartu diblokir oleh bagian akademik/keuangan';
  END IF;
  UPDATE public.students SET last_downloaded_at = v_now, updated_at = v_now WHERE nim = p_nim;
  RETURN v_now;
END;
$$;

-- 3. AKTIFKAN ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

-- Policies: students
DROP POLICY IF EXISTS "Public read students for exam card" ON public.students;
CREATE POLICY "Public read students for exam card"
  ON public.students FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Public update last_downloaded_at on printable student" ON public.students;
CREATE POLICY "Public update last_downloaded_at on printable student"
  ON public.students FOR UPDATE
  TO anon, authenticated
  USING (can_print = TRUE OR public.is_admin())
  WITH CHECK (can_print = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admin insert students" ON public.students;
CREATE POLICY "Admin insert students"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete students" ON public.students;
CREATE POLICY "Admin delete students"
  ON public.students FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Policies: schedules
DROP POLICY IF EXISTS "Public read schedules" ON public.schedules;
CREATE POLICY "Public read schedules"
  ON public.schedules FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin write schedules" ON public.schedules;
CREATE POLICY "Admin write schedules"
  ON public.schedules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies: branding
DROP POLICY IF EXISTS "Public read branding" ON public.branding;
CREATE POLICY "Public read branding"
  ON public.branding FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin update branding" ON public.branding;
CREATE POLICY "Admin update branding"
  ON public.branding FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies: admins
DROP POLICY IF EXISTS "Admin read admins" ON public.admins;
CREATE POLICY "Admin read admins"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.is_admin() OR lower(email) = public.current_jwt_email());

DROP POLICY IF EXISTS "Admin manage admins" ON public.admins;
CREATE POLICY "Admin manage admins"
  ON public.admins FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies: proctors
DROP POLICY IF EXISTS "Proctor and Admin read proctors" ON public.proctors;
CREATE POLICY "Proctor and Admin read proctors"
  ON public.proctors FOR SELECT
  TO authenticated
  USING (public.is_proctor() OR lower(email) = public.current_jwt_email());

DROP POLICY IF EXISTS "Admin manage proctors" ON public.proctors;
CREATE POLICY "Admin manage proctors"
  ON public.proctors FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies: exam_attendance
DROP POLICY IF EXISTS "Proctor and Admin read exam_attendance" ON public.exam_attendance;
CREATE POLICY "Proctor and Admin read exam_attendance"
  ON public.exam_attendance FOR SELECT
  TO authenticated
  USING (public.is_proctor());

DROP POLICY IF EXISTS "Proctor and Admin write exam_attendance" ON public.exam_attendance;
CREATE POLICY "Proctor and Admin write exam_attendance"
  ON public.exam_attendance FOR INSERT
  TO authenticated
  WITH CHECK (public.is_proctor());

DROP POLICY IF EXISTS "Proctor and Admin update exam_attendance" ON public.exam_attendance;
CREATE POLICY "Proctor and Admin update exam_attendance"
  ON public.exam_attendance FOR UPDATE
  TO authenticated
  USING (public.is_proctor())
  WITH CHECK (public.is_proctor());

DROP POLICY IF EXISTS "Admin delete exam_attendance" ON public.exam_attendance;
CREATE POLICY "Admin delete exam_attendance"
  ON public.exam_attendance FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. DATA AWAL (SEED)
-- ----------------------------------------------------------------------------

INSERT INTO public.admins (email, name, role, added_by)
VALUES
  ('muhtyas.yugioh@gmail.com', 'Super Admin Utama', 'superadmin', 'system'),
  ('adminkartuunikma@unikma.local', 'Admin Kartu UNIKMA', 'superadmin', 'system')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.branding (
  id, campus_name, motto, primary_color, secondary_color, logo_url,
  faculties, batches, classes, majors, academic_years, subjects,
  instructors, rooms, time_slots, important_notes,
  signatory_name, signatory_role, footer_copyright
)
VALUES (
  1,
  'STMIK Komputama Majenang',
  'Unggul dalam Teknologi Informasi dan Inovasi Bisnis Digital',
  '#EA6113',
  '#F88F22',
  '',
  '[
    {
      "id": "fst",
      "name": "Fakultas Sains dan Teknologi",
      "deanName": "Nurul Alfiah, M.Kom.",
      "deanNidn": "",
      "majors": ["Sistem Informasi", "Teknik Informatika", "Teknologi Informasi"]
    },
    {
      "id": "fpis",
      "name": "Fakultas Pendidikan dan Ilmu Sosial",
      "deanName": "Much Solehudin, M.Pd.",
      "deanNidn": "",
      "majors": ["Bisnis Digital", "Pendidikan Matematika"]
    },
    {
      "id": "fpai",
      "name": "Fakultas Pendidikan Agama Islam",
      "deanName": "Much Solehudin, M.Pd.",
      "deanNidn": "",
      "majors": ["Pendidikan Agama Islam", "Komunikasi dan Penyiaran Islam"]
    }
  ]'::jsonb,
  '["2022", "2023", "2024", "2025", "2026"]'::jsonb,
  '["TI-A", "TI-B", "SI-A", "BD-A"]'::jsonb,
  '["Sistem Informasi", "Teknik Informatika", "Teknologi Informasi", "Bisnis Digital", "Pendidikan Matematika", "Pendidikan Agama Islam", "Komunikasi dan Penyiaran Islam"]'::jsonb,
  '["2025/2026 Ganjil", "2025/2026 Genap", "2026/2027 Ganjil"]'::jsonb,
  '[
    {"code": "IF301", "name": "Algoritma & Struktur Data", "sks": 3},
    {"code": "IF302", "name": "Basis Data Lanjut", "sks": 3},
    {"code": "IF303", "name": "Rekayasa Perangkat Lunak", "sks": 3},
    {"code": "IF304", "name": "Jaringan Komputer", "sks": 3},
    {"code": "IF305", "name": "Kecerdasan Buatan", "sks": 3}
  ]'::jsonb,
  '[
    "Ahmad Fauzi, M.Kom.",
    "Rina Kusuma, S.Kom., M.T.",
    "Budi Santoso, M.Cs.",
    "Dewi Lestari, S.T., M.Kom."
  ]'::jsonb,
  '["R. 101", "R. 102", "Lab Komputer 1", "Lab Komputer 2", "Aula Utama"]'::jsonb,
  '["08:00 - 09:30", "10:00 - 11:30", "13:00 - 14:30", "15:00 - 16:30"]'::jsonb,
  '[
    "Kartu Ujian wajib dicetak pada kertas A4 dan dibawa saat pelaksanaan ujian berlangsung.",
    "Peserta hadir di ruang ujian paling lambat 15 menit sebelum ujian dimulai.",
    "Wajib membawa kartu identitas resmi (KTM/KTP) dan mengenakan pakaian rapi serta bersepatu.",
    "Dilarang membawa catatan tidak sah atau mengoperasikan alat komunikasi selama ujian berlangsung."
  ]'::jsonb,
  'Nurul Alfiah, M.Kom.',
  'Dekan Fakultas Sains dan Teknologi',
  'Panitia Ujian Akademik — Sistem Informasi Distribusi Kartu Ujian'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students (nim, name, faculty, major, class_name, campus, batch, can_print, student_type)
VALUES
  ('202401001', 'Bagas Pratama Putra', 'Fakultas Sains dan Teknologi', 'Teknik Informatika', 'TI-A', 'Kampus Utama Majenang', '2024', TRUE, 'Reguler'),
  ('202401002', 'Nadia Putri Rahmawati', 'Fakultas Sains dan Teknologi', 'Sistem Informasi', 'SI-A', 'Kampus Utama Majenang', '2024', TRUE, 'Reguler'),
  ('202401003', 'Rizky Ramadhan', 'Fakultas Pendidikan dan Ilmu Sosial', 'Bisnis Digital', 'BD-A', 'Kampus Utama Majenang', '2024', FALSE, 'Karyawan')
ON CONFLICT (nim) DO NOTHING;

INSERT INTO public.schedules (id, class_id, batch_id, academic_year, campus, major, schedules)
VALUES
  (
    'TI-A_2024_2026/2027 Ganjil',
    'TI-A',
    '2024',
    '2026/2027 Ganjil',
    'Kampus Utama Majenang',
    'Teknik Informatika',
    '[
      {"code": "IF301", "subject": "Algoritma & Struktur Data", "instructor": "Ahmad Fauzi, M.Kom.", "day": "Senin", "date": "2026-11-23", "time": "08:00 - 09:30", "room": "R. 101", "sks": 3},
      {"code": "IF302", "subject": "Basis Data Lanjut", "instructor": "Rina Kusuma, S.Kom., M.T.", "day": "Selasa", "date": "2026-11-24", "time": "10:00 - 11:30", "room": "Lab Komputer 1", "sks": 3},
      {"code": "IF303", "subject": "Rekayasa Perangkat Lunak", "instructor": "Budi Santoso, M.Cs.", "day": "Rabu", "date": "2026-11-25", "time": "08:00 - 09:30", "room": "R. 102", "sks": 3},
      {"code": "IF304", "subject": "Jaringan Komputer", "instructor": "Dewi Lestari, S.T., M.Kom.", "day": "Kamis", "date": "2026-11-26", "time": "13:00 - 14:30", "room": "Lab Komputer 2", "sks": 3}
    ]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
