import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { BrandingConfig, FacultyConfig, MasterSubject } from '../../types.ts';
import { apiFetch } from '../../lib/supabaseClient.ts';

interface AdminMasterTabProps {
  branding: BrandingConfig;
  onSaveBranding: (next: BrandingConfig) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

function StringListEditor({
  title,
  items,
  placeholder,
  onChange,
}: {
  title: string;
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const val = draft.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-900 focus:border-[#EA6113] focus:outline-none focus:ring-2 focus:ring-[#FFE3B3]"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-lg bg-[#EA6113] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B]"
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah
        </button>
      </div>

      <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
        {items.length === 0 ? (
          <li className="py-2 text-xs text-stone-400">Belum ada item.</li>
        ) : (
          items.map((item) => (
            <li key={item} className="flex items-center justify-between py-2 text-xs text-stone-800">
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== item))}
                className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Hapus ${item}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function AdminMasterTab({
  branding,
  onSaveBranding,
  onRefresh,
  onNotify,
}: AdminMasterTabProps) {
  const [draft, setDraft] = useState<BrandingConfig>(branding);
  const [saving, setSaving] = useState(false);
  const [syncingFaculties, setSyncingFaculties] = useState(false);

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  // New Faculty Form
  const [newFacName, setNewFacName] = useState('');
  const [newDeanName, setNewDeanName] = useState('');
  const [newDeanNidn, setNewDeanNidn] = useState('');
  const [newFacMajors, setNewFacMajors] = useState('');

  // New Subject Form
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjSks, setNewSubjSks] = useState(3);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveBranding(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFacultyMapping = async () => {
    setSyncingFaculties(true);
    try {
      const res = await apiFetch<{ updatedStudentsCount: number }>('/api/admin/sync-faculty-mapping', {
        method: 'POST',
      });
      await onRefresh();
      onNotify(
        `Pengelompokan 3 Fakultas & 7 Prodi berhasil diterapkan (${res.updatedStudentsCount} data mahasiswa ikut disinkronkan).`
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Gagal menyinkronkan pengelompokan fakultas dan prodi.'
      );
    } finally {
      setSyncingFaculties(false);
    }
  };

  const addFaculty = () => {
    if (!newFacName.trim() || !newDeanName.trim()) return;
    const majorsList = newFacMajors
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const nextFac: FacultyConfig = {
      id: `fac_${Date.now()}`,
      name: newFacName.trim(),
      deanName: newDeanName.trim(),
      deanNidn: newDeanNidn.trim(),
      majors: majorsList,
    };
    setDraft({ ...draft, faculties: [...draft.faculties, nextFac] });
    setNewFacName('');
    setNewDeanName('');
    setNewDeanNidn('');
    setNewFacMajors('');
  };

  const addSubject = () => {
    if (!newSubjCode.trim() || !newSubjName.trim()) return;
    const nextSubj: MasterSubject = {
      code: newSubjCode.trim().toUpperCase(),
      name: newSubjName.trim(),
      sks: Number(newSubjSks) || 3,
    };
    setDraft({ ...draft, subjects: [...draft.subjects, nextSubj] });
    setNewSubjCode('');
    setNewSubjName('');
    setNewSubjSks(3);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h3 className="font-academic text-lg font-semibold text-stone-900">
            Pengelolaan Data Master Akademik
          </h3>
          <p className="text-xs text-stone-500">
            Atur struktur Fakultas & Dekan penandatangan otomatis, Prodi, Angkatan, Kelas, Mata Kuliah, Dosen, Ruang, dan Slot Waktu.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#EA6113] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan...' : 'Simpan Semua Data Master'}
        </button>
      </div>

      {/* Fakultas & Dekan Penandatangan Otomatis */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-stone-900">
              Struktur Fakultas &amp; Dekan Penandatangan Otomatis
            </h4>
            <p className="text-xs text-stone-500">
              Tanda tangan Dekan pada kartu ujian A4 dipilih otomatis berdasarkan Prodi atau Fakultas mahasiswa.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingFaculties}
            onClick={handleSyncFacultyMapping}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#F88F22] bg-[#FFE3B3]/35 px-3 py-1.5 text-xs font-semibold text-[#C24908] transition-colors hover:bg-[#FFE3B3]/65 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingFaculties ? 'animate-spin' : ''}`} />
            {syncingFaculties
              ? 'Menyinkronkan...'
              : 'Sinkronkan Fakultas Mahasiswa Sesuai Prodi'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={newFacName}
            onChange={(e) => setNewFacName(e.target.value)}
            placeholder="Nama Fakultas"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="text"
            value={newDeanName}
            onChange={(e) => setNewDeanName(e.target.value)}
            placeholder="Nama Dekan & Gelar"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="text"
            value={newDeanNidn}
            onChange={(e) => setNewDeanNidn(e.target.value)}
            placeholder="NIDN / NIP"
            className="rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newFacMajors}
              onChange={(e) => setNewFacMajors(e.target.value)}
              placeholder="Prodi (pisah koma)"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-[#EA6113] focus:outline-none"
            />
            <button
              type="button"
              onClick={addFaculty}
              className="rounded-lg bg-[#EA6113] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B] whitespace-nowrap"
            >
              Tambah
            </button>
          </div>
        </div>

        <div className="divide-y divide-stone-200 border-t border-stone-200">
          {draft.faculties.map((f, idx) => (
            <div
              key={f.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  value={f.name}
                  onChange={(e) => {
                    const next = [...draft.faculties];
                    next[idx] = { ...f, name: e.target.value };
                    setDraft({ ...draft, faculties: next });
                  }}
                  className="rounded border border-stone-200 px-2.5 py-1.5 text-xs font-semibold focus:border-[#EA6113] focus:outline-none"
                />
                <input
                  value={f.deanName}
                  onChange={(e) => {
                    const next = [...draft.faculties];
                    next[idx] = { ...f, deanName: e.target.value };
                    setDraft({ ...draft, faculties: next });
                  }}
                  className="rounded border border-stone-200 px-2.5 py-1.5 text-xs focus:border-[#EA6113] focus:outline-none"
                />
                <input
                  value={f.deanNidn}
                  onChange={(e) => {
                    const next = [...draft.faculties];
                    next[idx] = { ...f, deanNidn: e.target.value };
                    setDraft({ ...draft, faculties: next });
                  }}
                  className="rounded border border-stone-200 px-2.5 py-1.5 font-mono text-xs focus:border-[#EA6113] focus:outline-none"
                />
                <input
                  value={f.majors.join(', ')}
                  onChange={(e) => {
                    const next = [...draft.faculties];
                    next[idx] = {
                      ...f,
                      majors: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    };
                    setDraft({ ...draft, faculties: next });
                  }}
                  placeholder="Prodi (pisah koma)"
                  className="rounded border border-stone-200 px-2.5 py-1.5 text-xs focus:border-[#EA6113] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    faculties: draft.faculties.filter((x) => x.id !== f.id),
                  })
                }
                className="self-end rounded border border-stone-200 p-1.5 text-red-600 hover:bg-red-50 sm:self-center"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Master Mata Kuliah */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
        <h4 className="text-sm font-semibold text-stone-900">Daftar Mata Kuliah Master</h4>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newSubjCode}
            onChange={(e) => setNewSubjCode(e.target.value)}
            placeholder="Kode (IF301)"
            className="w-32 rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="text"
            value={newSubjName}
            onChange={(e) => setNewSubjName(e.target.value)}
            placeholder="Nama Mata Kuliah"
            className="flex-1 min-w-[200px] rounded-lg border border-stone-300 px-3 py-1.5 text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <input
            type="number"
            min={1}
            max={6}
            value={newSubjSks}
            onChange={(e) => setNewSubjSks(Number(e.target.value))}
            className="w-20 rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-sm focus:border-[#EA6113] focus:outline-none"
          />
          <button
            type="button"
            onClick={addSubject}
            className="inline-flex items-center gap-1 rounded-lg bg-[#EA6113] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#D1520B]"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah MK
          </button>
        </div>

        <div className="overflow-x-auto border-t border-stone-200 pt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-stone-500">
                <th className="py-2 pr-3">Kode</th>
                <th className="py-2 pr-3">Nama Mata Kuliah</th>
                <th className="py-2 pr-3">SKS</th>
                <th className="py-2 text-right">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {draft.subjects.map((subj, idx) => (
                <tr key={`${subj.code}-${idx}`}>
                  <td className="py-2 pr-3 font-mono font-semibold text-stone-900">{subj.code}</td>
                  <td className="py-2 pr-3 text-stone-800">{subj.name}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{subj.sks}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          subjects: draft.subjects.filter((_, i) => i !== idx),
                        })
                      }
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid of String List Managers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StringListEditor
          title="Angkatan"
          items={draft.batches}
          placeholder="Contoh: 2026"
          onChange={(batches) => setDraft({ ...draft, batches })}
        />
        <StringListEditor
          title="Kelas"
          items={draft.classes}
          placeholder="Contoh: TI-C"
          onChange={(classes) => setDraft({ ...draft, classes })}
        />
        <StringListEditor
          title="Program Studi"
          items={draft.majors}
          placeholder="Contoh: Teknik Informatika"
          onChange={(majors) => setDraft({ ...draft, majors })}
        />
        <StringListEditor
          title="Tahun Akademik"
          items={draft.academic_years}
          placeholder="Contoh: 2026/2027 Genap"
          onChange={(academic_years) => setDraft({ ...draft, academic_years })}
        />
        <StringListEditor
          title="Dosen Pengampu"
          items={draft.instructors}
          placeholder="Nama Dosen & Gelar"
          onChange={(instructors) => setDraft({ ...draft, instructors })}
        />
        <StringListEditor
          title="Ruang Ujian"
          items={draft.rooms}
          placeholder="Contoh: R. 204"
          onChange={(rooms) => setDraft({ ...draft, rooms })}
        />
        <StringListEditor
          title="Slot Waktu Ujian"
          items={draft.time_slots}
          placeholder="Contoh: 08:00 - 09:30"
          onChange={(time_slots) => setDraft({ ...draft, time_slots })}
        />
      </div>
    </div>
  );
}
