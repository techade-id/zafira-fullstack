import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { tanggal, tanggalWaktu } from "../lib/format";
import { jenisBerkas } from "../lib/berkas";
import { usePratinjau } from "./PratinjauBerkas";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import { Modal, PrimaryButton, Badge, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, NEGATIVE, inputStyle } from "./ui";

/**
 * Meninjau satu pengajuan perubahan catatan (migrasi 025) — dari mana pun.
 *
 * Pengajuan ditemukan di banyak tempat: lonceng, pop-up, Riwayat prospek,
 * Dashboard. Kalau setiap tempat itu hanya mengantar ke halaman Persetujuan,
 * Admin harus mencari lagi kartu yang tadi sudah ia lihat. Jendela ini
 * membawa keputusan ke tempat pengajuan itu ditemukan.
 */

export const EVENT_PENGAJUAN = "pengajuan-berubah";

export const SELECT_PENGAJUAN =
  "*, leads(name), pengaju:profiles!lead_activity_edits_diajukan_oleh_fkey(full_name), pemutus:profiles!lead_activity_edits_diputuskan_oleh_fkey(full_name)";

export const LABEL_STATUS = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" };

/** Semua tampilan yang memuat pengajuan, riwayat, atau lonceng ikut segar. */
export function kabarkanPengajuan(leadId) {
  window.dispatchEvent(new CustomEvent(EVENT_PENGAJUAN, { detail: { leadId } }));
  if (leadId) kabarkanRiwayat({ leadId });
  segarkanNotifikasi();
}

/** @returns pesan galat, atau null bila berhasil */
export async function putuskanPengajuan(edit, setujui, alasan = null) {
  const { error } = await supabase.rpc("putuskan_ubah_catatan", { p_edit_id: edit.id, p_setujui: setujui, p_alasan: alasan });
  if (error) return error.message;
  kabarkanPengajuan(edit.lead_id);
  return null;
}

/** Alasan, sebelum/sesudah berdampingan, dan bukti tambahan. */
export function PerbandinganCatatan({ edit, bukti = [], onBukaBukti }) {
  const lama = edit.lama || {};
  const bidang = [
    { label: "Jenis", sebelum: lama.activity, sesudah: edit.aktivitas_baru },
    { label: "Tanggal follow-up", sebelum: lama.tanggal_followup ? tanggal(lama.tanggal_followup) : null, sesudah: tanggal(edit.tanggal_baru) },
    { label: "Hasil", sebelum: lama.hasil, sesudah: edit.hasil_baru },
    { label: "Catatan", sebelum: lama.note, sesudah: edit.catatan_baru },
  ];
  const daftarBukti = bukti.map((b) => ({ bucket: "berkas-lampiran", path: b.file_url, judul: "Bukti tambahan", keterangan: b.file_name || "Bukti", nama: b.file_name }));

  return (
    <>
      <div style={{ background: PRIMARY_SOFT, borderRadius: 11, padding: "9px 12px", fontSize: 12.5, color: TEXT_DARK, marginBottom: 12, lineHeight: 1.5 }}>
        <b>Alasan:</b> {edit.alasan}
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: KOLOM, fontSize: 11, fontWeight: 700, color: TEXT_MID, background: "#F7F9FC", letterSpacing: "0.03em" }}>
          <div style={sel}>BAGIAN</div>
          <div style={sel}>SEBELUM</div>
          <div style={sel}>SESUDAH</div>
        </div>
        {bidang.map((b) => {
          const berubah = (b.sebelum || "") !== (b.sesudah || "");
          return (
            <div key={b.label} style={{ display: "grid", gridTemplateColumns: KOLOM, fontSize: 12.5, borderTop: `1px solid ${BORDER}`, background: berubah ? ACCENT_SOFT : SURFACE }}>
              <div style={{ ...sel, color: TEXT_MID, fontWeight: 600 }}>{b.label}</div>
              <div style={{ ...sel, color: berubah ? TEXT_MID : TEXT_DARK, textDecoration: berubah && b.sebelum ? "line-through" : "none", whiteSpace: "pre-wrap" }}>
                {b.sebelum || "—"}
              </div>
              <div style={{ ...sel, color: TEXT_DARK, fontWeight: berubah ? 600 : 400, whiteSpace: "pre-wrap" }}>{b.sesudah || "—"}</div>
            </div>
          );
        })}
      </div>

      {bukti.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>Bukti tambahan:</span>
          {bukti.map((b, i) => {
            const Ikon = jenisBerkas(b.file_name || b.file_url) === "gambar" ? ImageIcon : FileText;
            return (
              <button
                key={b.id}
                onClick={() => onBukaBukti?.(daftarBukti, i)}
                title={b.file_name || "Buka bukti"}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 220, border: `1px solid ${BORDER}`, background: PRIMARY_SOFT, color: PRIMARY, borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                <Ikon size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.file_name || `Bukti ${i + 1}`}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Keputusan yang sudah diambil, satu baris. */
export function HasilKeputusan({ edit }) {
  if (edit.status === "menunggu") return null;
  return (
    <div style={{ fontSize: 12, color: edit.status === "ditolak" ? NEGATIVE : TEXT_MID, marginTop: 12, lineHeight: 1.5 }}>
      {edit.status === "disetujui" ? "Disetujui" : "Ditolak"} {edit.pemutus?.full_name || ""} · {tanggalWaktu(edit.diputuskan_at)}
      {edit.status === "ditolak" && edit.alasan_tolak ? ` — ${edit.alasan_tolak}` : ""}
    </div>
  );
}

/**
 * Tombol Setujui/Tolak. Menolak membuka isian alasan di tempat — alasan itulah
 * yang dibaca pengaju untuk memperbaiki pengajuannya.
 */
export function TombolKeputusan({ edit, onSelesai }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState("");

  useEffect(() => {
    setTolak(false);
    setAlasan("");
    setGalat("");
    setSibuk(false);
  }, [edit?.id]);

  async function jalankan(setujui) {
    if (!setujui && !alasan.trim()) {
      setGalat("Tuliskan alasan penolakannya.");
      return;
    }
    setSibuk(true);
    setGalat("");
    const pesan = await putuskanPengajuan(edit, setujui, setujui ? null : alasan.trim());
    setSibuk(false);
    if (pesan) {
      setGalat(pesan);
      return;
    }
    toast.sukses(setujui ? `Perubahan catatan ${edit.leads?.name || ""} disetujui.` : "Pengajuan ditolak — pengaju akan melihat alasannya.");
    onSelesai?.();
  }

  if (tolak) {
    return (
      <div style={{ width: "100%" }}>
        <label htmlFor={`tolak-${edit.id}`} style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
          Alasan penolakan
        </label>
        <textarea
          id={`tolak-${edit.id}`}
          autoFocus
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="mis. Tanggal di bukti chat menunjukkan 6 Okt, bukan 7 Okt"
          style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }}
        />
        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 10 }}>
            {galat}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setTolak(false)} disabled={sibuk} style={gayaSekunder}>
            Batal
          </button>
          <button onClick={() => jalankan(false)} disabled={sibuk} style={{ ...gayaTolak, background: NEGATIVE, color: "#fff" }}>
            {sibuk ? "Menyimpan…" : "Tolak Pengajuan"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setTolak(true)} disabled={sibuk} style={gayaTolak}>
          Tolak
        </button>
        <PrimaryButton onClick={() => jalankan(true)} disabled={sibuk}>
          {sibuk ? "Memproses…" : "Setujui"}
        </PrimaryButton>
      </div>
      {galat && (
        <div role="alert" style={{ fontSize: 12, color: NEGATIVE, maxWidth: 320, textAlign: "right" }}>
          {galat}
        </div>
      )}
    </div>
  );
}

/** Jendela tinjau satu pengajuan, dibuka dari lonceng, pop-up, atau Riwayat. */
export default function TinjauPengajuan({ editId, open, onClose }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const bolehPutus = canWrite(profile, "catatan_putus");
  const [edit, setEdit] = useState(null);
  const [bukti, setBukti] = useState([]);
  const [galat, setGalat] = useState("");
  const [bukaPratinjau, pratinjau] = usePratinjau();

  async function muat() {
    const [{ data, error }, lampiran] = await Promise.all([
      supabase.from("lead_activity_edits").select(SELECT_PENGAJUAN).eq("id", editId).maybeSingle(),
      supabase.from("berkas_lampiran").select("id, file_url, file_name").eq("edit_id", editId),
    ]);
    if (error || !data) {
      setGalat(error?.message || "Pengajuan tidak ditemukan.");
      return;
    }
    setEdit(data);
    setBukti(lampiran.data || []);
  }

  useEffect(() => {
    if (!open || !editId) return;
    setEdit(null);
    setGalat("");
    muat();
  }, [open, editId]);

  if (!open) return null;

  return (
    <>
      <Modal open labelledBy="tinjau-judul" onClose={onClose} width={600}>
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div id="tinjau-judul" style={{ fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                Tinjau Perubahan Catatan
                {edit && <Badge value={edit.status === "disetujui" ? "terverifikasi" : edit.status} label={LABEL_STATUS[edit.status]} />}
              </div>
              {edit && (
                <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 4 }}>
                  <button
                    onClick={() => {
                      onClose();
                      navigate(`/follow-up?sorot=${edit.lead_id}`);
                    }}
                    style={{ border: "none", background: "none", padding: 0, color: PRIMARY, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {edit.leads?.name || "Prospek"}
                  </button>
                  {` · diajukan ${edit.pengaju?.full_name || "-"} · ${tanggalWaktu(edit.diajukan_at)}`}
                </div>
              )}
            </div>
            <button onClick={onClose} aria-label="Tutup" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {galat && <div style={{ fontSize: 13, color: NEGATIVE }}>{galat}</div>}
          {!edit && !galat && <div style={{ fontSize: 13, color: TEXT_MID }}>Memuat pengajuan…</div>}

          {edit && (
            <>
              <PerbandinganCatatan edit={edit} bukti={bukti} onBukaBukti={bukaPratinjau} />
              <HasilKeputusan edit={edit} />
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/persetujuan?sorot=${edit.id}`);
                  }}
                  style={{ border: "none", background: "none", padding: 0, color: TEXT_MID, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Semua pengajuan →
                </button>
                {bolehPutus && edit.status === "menunggu" && (
                  <div style={{ flex: "1 1 260px", display: "flex", justifyContent: "flex-end" }}>
                    <TombolKeputusan edit={edit} onSelesai={onClose} />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      </Modal>
      {pratinjau}
    </>
  );
}

const KOLOM = "minmax(90px, 0.6fr) 1fr 1fr";
const sel = { padding: "8px 11px", minWidth: 0, wordBreak: "break-word" };

const gayaTolak = {
  border: `1px solid ${NEGATIVE}`,
  background: SURFACE,
  color: NEGATIVE,
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
