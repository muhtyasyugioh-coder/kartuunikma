import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileSpreadsheet, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import type { BrandingConfig, ExamSchedule, ScheduleItem } from '../../types.ts';
import {
  formatScheduleDateId,
  getIndonesianDayFromDate,
  normalizeExamDate,
} from '../../lib/defaults.ts';
import { apiFetch } from '../../lib/supabaseClient.ts';
import {
  downloadScheduleExcelTemplate,
  parseScheduleExcelFile,
} from '../../lib/excel.ts';
import { ConfirmDialog } from '../ConfirmDialog.tsx';

interface AdminSchedulesTabProps {
  schedules: ExamSchedule[];
  branding: BrandingConfig;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export function AdminSchedulesTab({
  schedules,
  branding,
  onRefresh,
  onNotify,
}: AdminSchedulesTabProps) {
  const [classId, setClassId] = useState(branding.classes[0] || 'TI-A');
  const [batchId, setBatchId] = useState(
    branding.batches[branding.batches.length - 1] || '2024'
  );
  const [academicYear, setAcademicYear] = useState(
    branding.academic_years[branding.academic_years.length - 1] || '2026/2027 Ganjil'
  );
  const [major, setMajor] = useState(branding.majors[0] || 'Teknik Informatika');
  const [campus, setCampus] = useState(branding.campus_name);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Draft new exam row
  const [draftRow, setDraftRow] = useState<ScheduleItem>({
    code: branding.subjects[0]?.code || 'IF301',
    subject: branding.subjects[0]?.name || 'Algoritma & Struktur Data',
    instructor: branding.instructors[0] || '',
    day: 'Senin',
    date: '2026-11-23',
    time: branding.time_slots[0] || '08:00 - 09:30',
    room: branding.rooms[0] || 'R. 101',
    sks: branding.subjects[0]?.sks || 3,
  });

  // Edit existing row modal state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentScheduleId = `${classId}_${batchId}_${academicYear}`;

  useEffect(() => {
    const existing = schedules.find((s) => s.id === currentScheduleId);
    if (existing) {
      setItems(existing.schedules || []);
      setMajor(existing.major || branding.majors[0] || '');
      setCampus(existing.campus || branding.campus_name);
    } else {
      setItems([]);
    }
    setEditingIndex(null);
    setEditDraft(null);
  }, [currentScheduleId, schedules, branding.majors, branding.campus_name]);

  const handleSelectMasterSubject = (code: string) => {
    const found = branding.subjects.find((s) => s.code === code);
    if (found) {
      setDraftRow((prev) => ({
        ...prev,
        code: found.code,
        subject: found.name,
        sks: found.sks,
      }));
    } else {
      setDraftRow((prev) => ({ ...prev, code }));
    }
  };

  const addItem = () => {
    if (!draftRow.subject.trim()) return;
    setItems((prev) => [...prev, { ...draftRow }]);
  };

  const persistSchedule = async (nextItems: ScheduleItem[], successMessage: string) => {
    await apiFetch('/api/admin/schedules', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        batch_id: batchId,
        academic_year: academicYear,
        campus,
        major,
        schedules: nextItems,
      }),
    });
    await onRefresh();
    onNotify(successMessage);
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await persistSchedule(items, `Jadwal ${currentScheduleId} berhasil disimpan.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan jadwal ujian.');
    } finally {
      setSaving(false);
    }
  };

  const openEditRowModal = (idx: number) => {
    const target = items[idx];
    if (!target) return;
    const normalizedDate = normalizeExamDate(target.date);
    const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) ? normalizedDate : target.date;
    setEditingIndex(idx);
    setEditDraft({
      code: target.code || '',
      subject: target.subject || '',
      instructor: target.instructor || '',
      day: target.day || getIndonesianDayFromDate(isoDate) || 'Senin',
      date: isoDate || '',
      time: target.time || '',
      room: target.room || '',
      sks: Number(target.sks) || 3,
    });
  };

  const handleSaveEditedRow = async (e: FormEvent) => {
    e.preventDefault();
    if (editingIndex === null || !editDraft || !editDraft.subject.trim()) return;

    const normalizedDate = normalizeExamDate(editDraft.date) || editDraft.date;
    const cleanedItem: ScheduleItem = {
      ...editDraft,
      code: editDraft.code.trim().toUpperCase(),
      subject: editDraft.subject.trim(),
      instructor: editDraft.instructor.trim(),
      room: editDraft.room.trim(),
      time: editDraft.time.trim(),
      date: normalizedDate,
      day: editDraft.day || getIndonesianDayFromDate(normalizedDate) || 'Senin',
      sks: Number(editDraft.sks) || 3,
    };

    const nextItems = items.map((item, idx) => (idx === editingIndex ? cleanedItem : item));
    setSavingEdit(true);
    try {
      setItems(nextItems);
      await persistSchedule(
        nextItems,
        `Mata kuliah ${cleanedItem.code || cleanedItem.subject} berhasil diperbarui.`
      );
      setEditingIndex(null);
      setEditDraft(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui baris jadwal.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleImportExcel = async (file: File) => {
    try {
      const parsed = await parseScheduleExcelFile(file);
      if (parsed.length === 0) {
        onNotify('File Excel jadwal kosong atau format kolom tidak sesuai template.');
        return;
      }
      await apiFetch('/api/admin/schedules/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ schedules: parsed }),
      });
      await onRefresh();
      onNotify(`${parsed.length} kelompok jadwal kelas berhasil diimpor.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengimpor Excel jadwal.');
    }
  };

  const classOptions = Array.from(new Set([...(classId ? [classId] : []), ...branding.classes]));
  const batchOptions = Array.from(new Set([...(batchId ? [batchId] : []), ...branding.batches]));
  const yearOptions = Array.from(
    new Set([...(academicYear ? [academicYear] : []), ...branding.academic_years])
  );
  const majorOptions = Array.from(new Set([...(major ? [major] : []), ...branding.majors]));

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h3 className="font-academic text-lg font-semibold text-stone-900">
            Manajemen Jadwal Ujian Kelas
          </h3>
          <p className="font-mono text-xs text-stone-500">ID Paket: {currentScheduleId}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportExcel(f);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
          >
            <Upload className="h-3.5 w-3.5 text-[#EA6113]" />
            Import Jadwal Excel
          </button>
          <button
            type="button"
            onClick={downloadScheduleExcelTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/25"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#EA6113]" />
            Template Jadwal
          </button>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Menyimpan...' : 'Simpan Jadwal Ini'}
          </button>
        </div>
      </div>

      {/* Target Class / Batch / Academic Year Selector */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="block text-xs font-semibold text-stone-600">Kelas</label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600">Angkatan</label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            {batchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600">Tahun Akademik</label>
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            {yearOptions.map((ay) => (
              <option key={ay} value={ay}>
                {ay}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600">Program Studi</label>
          <select
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          >
            {majorOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600">Kampus</label>
          <input
            value={campus}
            onChange={(e) => setCampus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
        </div>
      </div>

      {/* Add Exam Row Builder */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
        <h4 className="text-sm font-semibold text-stone-900">Tambah Mata Kuliah Ujian</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-stone-600">Pilih Mata Kuliah Master</label>
            <select
              value={draftRow.code}
              onChange={(e) => handleSelectMasterSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            >
              {branding.subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} ({s.sks} SKS)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Nama Mata Kuliah</label>
            <input
              value={draftRow.subject}
              onChange={(e) => setDraftRow({ ...draftRow, subject: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Dosen Pengampu</label>
            <select
              value={draftRow.instructor}
              onChange={(e) => setDraftRow({ ...draftRow, instructor: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            >
              <option value="">Pilih Dosen</option>
              {branding.instructors.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Ruang Ujian</label>
            <select
              value={draftRow.room}
              onChange={(e) => setDraftRow({ ...draftRow, room: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            >
              {branding.rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Hari</label>
            <select
              value={draftRow.day}
              onChange={(e) => setDraftRow({ ...draftRow, day: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Tanggal Ujian</label>
            <input
              type="date"
              value={draftRow.date}
              onChange={(e) => {
                const nextDate = e.target.value;
                const autoDay = getIndonesianDayFromDate(nextDate);
                setDraftRow({
                  ...draftRow,
                  date: nextDate,
                  day: autoDay || draftRow.day,
                });
              }}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Slot Waktu</label>
            <select
              value={draftRow.time}
              onChange={(e) => setDraftRow({ ...draftRow, time: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
            >
              {branding.time_slots.map((ts) => (
                <option key={ts} value={ts}>
                  {ts}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-20">
              <label className="block text-xs font-medium text-stone-600">SKS</label>
              <input
                type="number"
                min={1}
                max={6}
                value={draftRow.sks}
                onChange={(e) => setDraftRow({ ...draftRow, sks: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EA6113] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B]"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambahkan
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Items Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#FAF7F2] text-xs font-semibold text-stone-600">
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Mata Kuliah</th>
                <th className="px-4 py-3">SKS</th>
                <th className="px-4 py-3">Hari & Tanggal</th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Ruang</th>
                <th className="px-4 py-3">Dosen</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-stone-500">
                    Belum ada jadwal mata kuliah pada paket {currentScheduleId}. Tambahkan di atas lalu klik Simpan.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={`${item.code}-${idx}`} className="hover:bg-[#FAF7F2]/70">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-stone-900">
                      {item.code}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-stone-900">{item.subject}</td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{item.sks}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="font-medium text-stone-800">{item.day}</span>
                      {' · '}
                      <span className="font-mono text-stone-600 tabular-nums">
                        {formatScheduleDateId(item.date)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{item.time}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-stone-800">{item.room}</td>
                    <td className="px-4 py-2.5 text-xs text-stone-600">{item.instructor}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRowModal(idx)}
                          title="Edit jadwal mata kuliah"
                          className="rounded border border-stone-200 bg-white p-1.5 text-stone-600 hover:border-[#F88F22] hover:bg-[#FFE3B3]/30 hover:text-[#C24908]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          title="Hapus mata kuliah"
                          className="rounded border border-stone-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Existing Schedule Packages Summary */}
      {schedules.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h4 className="text-xs font-semibold tracking-wide text-[#EA6113] uppercase">
            Paket Jadwal Tersimpan ({schedules.length})
          </h4>
          <div className="mt-3 divide-y divide-stone-100">
            {schedules.map((sch) => {
              const isSelected = sch.id === currentScheduleId;
              return (
                <div
                  key={sch.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-xs transition-colors ${
                    isSelected ? 'bg-[#FFE3B3]/25' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setClassId(sch.class_id);
                      setBatchId(sch.batch_id);
                      setAcademicYear(sch.academic_year);
                    }}
                    className="text-left hover:text-[#EA6113] hover:underline"
                  >
                    <span className="font-mono font-semibold text-stone-900">{sch.id}</span>
                    <span className="mx-1.5 text-stone-400">·</span>
                    <span className="text-stone-600">
                      {sch.major || 'Umum'} ({sch.schedules?.length || 0} MK)
                    </span>
                  </button>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setClassId(sch.class_id);
                        setBatchId(sch.batch_id);
                        setAcademicYear(sch.academic_year);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2.5 py-1 text-stone-700 hover:border-[#F88F22] hover:bg-[#FFE3B3]/30 hover:text-[#C24908]"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Paket
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(sch.id)}
                      className="rounded border border-stone-200 bg-white px-2.5 py-1 text-red-600 hover:bg-red-50"
                    >
                      Hapus Paket
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Schedule Item Modal */}
      {editingIndex !== null && editDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-academic text-lg font-semibold text-stone-900">
                  Edit Jadwal Mata Kuliah
                </h3>
                <p className="font-mono text-[11px] text-stone-500">
                  Paket {currentScheduleId} · Baris #{editingIndex + 1}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
                  setEditDraft(null);
                }}
                className="rounded p-1 text-stone-400 hover:text-stone-700"
                aria-label="Tutup modal edit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedRow} className="mt-4 space-y-3 text-sm">
              {branding.subjects.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700">
                    Ambil Cepat dari Master Mata Kuliah (Opsional)
                  </label>
                  <select
                    value={
                      branding.subjects.some((s) => s.code === editDraft.code)
                        ? editDraft.code
                        : ''
                    }
                    onChange={(e) => {
                      const found = branding.subjects.find((s) => s.code === e.target.value);
                      if (found) {
                        setEditDraft({
                          ...editDraft,
                          code: found.code,
                          subject: found.name,
                          sks: found.sks,
                        });
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    <option value="">— Pilih atau ubah manual di bawah —</option>
                    {branding.subjects.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name} ({s.sks} SKS)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Kode MK *</label>
                  <input
                    required
                    value={editDraft.code}
                    onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-stone-700">
                    Nama Mata Kuliah *
                  </label>
                  <input
                    required
                    value={editDraft.subject}
                    onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Tanggal Ujian *</label>
                  <input
                    required
                    type="date"
                    value={editDraft.date}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      const autoDay = getIndonesianDayFromDate(nextDate);
                      setEditDraft({
                        ...editDraft,
                        date: nextDate,
                        day: autoDay || editDraft.day,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Hari</label>
                  <select
                    value={editDraft.day}
                    onChange={(e) => setEditDraft({ ...editDraft, day: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">SKS</label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={6}
                    value={editDraft.sks}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, sks: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Slot Waktu *</label>
                  <input
                    required
                    list="edit-schedule-time-slots"
                    value={editDraft.time}
                    onChange={(e) => setEditDraft({ ...editDraft, time: e.target.value })}
                    placeholder="08:00 - 09:30"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                  <datalist id="edit-schedule-time-slots">
                    {branding.time_slots.map((ts) => (
                      <option key={ts} value={ts} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Ruang Ujian *</label>
                  <input
                    required
                    list="edit-schedule-rooms"
                    value={editDraft.room}
                    onChange={(e) => setEditDraft({ ...editDraft, room: e.target.value })}
                    placeholder="R. 101"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                  />
                  <datalist id="edit-schedule-rooms">
                    {branding.rooms.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Dosen Pengampu</label>
                <input
                  list="edit-schedule-instructors"
                  value={editDraft.instructor}
                  onChange={(e) => setEditDraft({ ...editDraft, instructor: e.target.value })}
                  placeholder="Nama Dosen & Gelar"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
                />
                <datalist id="edit-schedule-instructors">
                  {branding.instructors.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingIndex(null);
                    setEditDraft(null);
                  }}
                  className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-[#FAF7F2]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Hapus Paket Jadwal?"
        description={`Jadwal ${deleteTargetId} akan dihapus permanen dari database.`}
        destructive
        loading={deleting}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={async () => {
          if (!deleteTargetId) return;
          setDeleting(true);
          try {
            await apiFetch(`/api/admin/schedules/${encodeURIComponent(deleteTargetId)}`, {
              method: 'DELETE',
            });
            setDeleteTargetId(null);
            await onRefresh();
            onNotify('Paket jadwal dihapus.');
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
