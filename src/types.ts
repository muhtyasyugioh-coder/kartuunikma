export type ExamType = 'UTS' | 'UAS';
export type AdminRole = 'superadmin' | 'admin';
export type AttendanceStatus = 'Hadir' | 'Izin' | 'Tidak Hadir';
export type CardPrintStatus = 'Siap Cetak' | 'Sudah Cetak' | 'Diblokir';
export type UserAuthStatus = 'active' | 'unconfirmed' | 'no_auth';

export interface Student {
  nim: string;
  name: string;
  faculty: string;
  major: string;
  class_name: string;
  campus: string;
  batch: string;
  can_print: boolean;
  student_type: string;
  last_downloaded_at: string | null;
}

export interface ScheduleItem {
  code: string;
  subject: string;
  instructor: string;
  day: string;
  date: string;
  time: string;
  room: string;
  sks: number;
}

export interface ExamSchedule {
  id: string; // classId_batchId_academicYear
  class_id: string;
  batch_id: string;
  academic_year: string;
  campus: string;
  major: string;
  schedules: ScheduleItem[];
}

export interface FacultyConfig {
  id: string;
  name: string;
  deanName: string;
  deanNidn: string;
  majors: string[];
}

export interface MasterSubject {
  code: string;
  name: string;
  sks: number;
}

export interface BrandingConfig {
  id: number;
  campus_name: string;
  motto: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  faculties: FacultyConfig[];
  batches: string[];
  classes: string[];
  majors: string[];
  academic_years: string[];
  subjects: MasterSubject[];
  instructors: string[];
  rooms: string[];
  time_slots: string[];
  important_notes: string[];
  signatory_name: string;
  signatory_role: string;
  footer_copyright: string;
}

export interface AdminUser {
  email: string;
  name: string;
  role: AdminRole;
  added_at: string;
  added_by: string;
}

export interface ProctorUser {
  email: string;
  name: string;
  assigned_room: string;
  faculty: string;
  added_at: string;
  added_by: string;
}

export interface ExamAttendance {
  id: string;
  nim: string;
  student_name: string;
  major: string;
  class_name: string;
  batch: string;
  exam_type: ExamType;
  academic_year: string;
  subject_code: string;
  subject_name: string;
  room: string;
  status: AttendanceStatus;
  card_verified: boolean;
  note: string;
  proctor_email: string;
  proctor_name: string;
  verified_at: string;
}

export interface PublicConfigResponse {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  superAdminEmail: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  email: string | null;
  name: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isProctor: boolean;
  adminInfo: AdminUser | null;
  proctorInfo: ProctorUser | null;
}

export interface SimulationPayload {
  isSimulation: boolean;
  student: Student;
  schedule: ExamSchedule;
  examType: ExamType;
}
