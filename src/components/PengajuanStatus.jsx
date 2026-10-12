import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { roleOf, canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { tanggalWaktu } from "../lib/format";
import { Modal, PrimaryButton, Badge, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, inputStyle } from "./ui";

/**
 * Status konsumen lewat pengajuan (migrasi 027).
 *
 * Status konsumen — proses, aktif, selesai — dulu diubah dari sebuah dropdown
 * dan langsung berlaku, tanpa alasan dan tanpa seorang pun yang menyetujui.
 * Klien meminta setiap perubahan data penting tercatat dan disetujui, supaya
 * tidak bisa dimanipulasi. Kini: pemegang konsumen mengajukan beserta
 * alasannya, Admin Sistem memutuskan. Database menolak perubahan status di
 * luar jalur ini (trigger customers_guard_status).
 *
 * Pembatalan tetap lewat menu Pembatalan — ia punya alasan, pengembalian
 * dana, dan catatannya sendiri.
 */

export const EVENT_STATUS = "status-konsumen-berubah";

export const SELECT_STATUS =
  "*, customers(name), pengaju:profiles!customer_status_edits_diajukan_oleh_fkey(full_name), pemutus:profiles!customer_status_edits_diputuskan_oleh_fkey(full_name)";

export const LABEL_STATUS_KONSUMEN = { proses: "Proses", aktif: "Aktif", selesai: "Selesai", batal: "Batal" };

const PILIHAN = ["proses", "aktif", "selesai"];

/** Kartu konsumen, halaman Persetujuan, dan lonceng ikut segar. */
export function kabarkanStatusKonsumen(customerId) {
  window.dispatchEvent(new CustomEvent(EVENT_STATUS, { detail: { customerId } }));
  segarkanNotifikasi();
}

/** Pengajuan yang menunggu untuk satu konsumen — null bila tidak ada. */
export function usePengajuanStatus(customerId) {
  const [menunggu, setMenunggu] = useState(null);

  useEffect(() => {
    if (!customerId) return undefined;
    let hidup = true;
    const muat = () =>
      supabase
        .from("customer_status_edits")
        .select(SELECT_STATUS)
        .eq("customer_id", customerId)
        .eq("status", "menunggu")
        .maybeSingle()
        // Sebelum migrasi 027 tabelnya belum ada — diam saja.
        .then(({ data, error }) => hidup && setMenunggu(error ? null : data || null));
    muat();
    const dengar = (e) => {
      if (!e.detail?.customerId || e.detail.customerId === customerId) muat();
    };
    window.addEventListener(EVENT_STATUS, dengar);
    return () => {
      hidup = false;
      window.removeEventListener(EVENT_STATUS, dengar);
    };
  }, [customerId]);

  return menunggu;
}

export function AjukanStatusKonsumen({ konsumen, open, onClose, onSelesai }) {
  const { profile } = useAuth();
  const toast = useToast();
  const langsung = roleOf(profile) === "admin";
  const [status, setStatus] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus("");
    setAlasan("");
    setGalat("");
    setKirim(false);
  }, [open]);

  if (!konsumen) return null;

  async function simpan() {
    if (!status) {
      setGalat("Pilih status barunya.");
      return;
    }
    if (!alasan.trim()) {
      setGalat("Tuliskan alasannya — itulah yang dibaca Admin saat memutuskan.");
      return;
    }
    setKirim(true);
    setGalat("");
    const { data, error } = await supabase.rpc("ajukan_status_konsumen", { p_customer_id: konsumen.id, p_status: status, p_alasan: alasan.trim() });
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    toast.sukses(data?.status === "disetujui" ? `Status ${konsumen.name} kini ${LABEL_STATUS_KONSUMEN[status]}.` : "Perubahan status diajukan — menunggu persetujuan Admin.");
    kabarkanStatusKonsumen(konsumen.id);
    onSelesai?.();
    onClose?.();
  }

  return (
    <Modal open={open} labelledBy="status-konsumen-judul" onClose={() => !kirim && onClose?.()} width={460}>
      <>
        <div id="status-konsumen-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          {langsung ? "Ubah Status Konsumen" : "Ajukan Perubahan Status"}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
          {langsung
            ? "Sebagai Admin Sistem, perubahan Anda langsung berlaku dan tetap tercatat beserta alasannya."
            : "Status tidak berubah sampai Admin Sistem menyetujui. Untuk membatalkan booking, gunakan menu Pembatalan."}
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelGaya}>
            Status sekarang <b style={{ color: TEXT_DARK }}>{LABEL_STATUS_KONSUMEN[konsumen.status] || konsumen.status}</b> — menjadi
          </span>
          <div role="radiogroup" aria-label="Status baru" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PILIHAN.filter((s) => s !== konsumen.status).map((s) => {
              const aktif = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setStatus(s)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                    background: aktif ? PRIMARY : SURFACE,
                    color: aktif ? "#fff" : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: aktif ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {LABEL_STATUS_KONSUMEN[s]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="sk-alasan" style={labelGaya}>
            Alasan<span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>
          </label>
          <input id="sk-alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Serah terima kunci sudah dilakukan 10 Okt" style={inputStyle} />
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : langsung ? "Simpan Status" : "Ajukan Perubahan"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

/** Tombol Setujui/Tolak; menolak meminta alasan di tempat. */
export function TombolKeputusanStatus({ edit, onSelesai }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState("");

  async function jalankan(setujui) {
    if (!setujui && !alasan.trim()) {
      setGalat("Tuliskan alasan penolakannya.");
      return;
    }
    setSibuk(true);
    setGalat("");
    const { error } = await supabase.rpc("putuskan_status_konsumen", { p_edit_id: edit.id, p_setujui: setujui, p_alasan: setujui ? null : alasan.trim() });
    setSibuk(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    kabarkanStatusKonsumen(edit.customer_id);
    toast.sukses(setujui ? `Status ${edit.customers?.name || "konsumen"} kini ${LABEL_STATUS_KONSUMEN[edit.status_baru]}.` : "Pengajuan ditolak — pengaju akan melihat alasannya.");
    onSelesai?.();
  }

  if (tolak) {
    return (
      <div style={{ width: "100%" }}>
        <label htmlFor={`tolak-status-${edit.id}`} style={labelGaya}>
          Alasan penolakan
        </label>
        <textarea
          id={`tolak-status-${edit.id}`}
          autoFocus
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="mis. Akad belum dilakukan, status belum bisa Selesai"
          style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }}
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

/** Satu pengajuan status, untuk halaman Persetujuan. */
export function KartuPengajuanStatus({ edit, disorot, onSelesai }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const bolehPutus = canWrite(profile, "catatan_putus");
  const label = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" }[edit.status];

  return (
    <div
      id={`pengajuan-status-${edit.id}`}
      style={{
        background: SURFACE,
        border: `1px solid ${disorot ? ACCENT_DARK : BORDER}`,
        boxShadow: disorot ? `0 0 0 1px ${ACCENT_DARK}` : "none",
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/konsumen/${edit.customer_id}`)}
              title="Buka kartu konsumen"
              style={{ border: "none", background: "none", padding: 0, fontSize: 15, fontWeight: 700, color: TEXT_DARK, cursor: "pointer", fontFamily: "inherit" }}
            >
              {edit.customers?.name || "Konsumen"} <ArrowRight size={13} style={{ verticalAlign: -2, color: TEXT_MID }} aria-hidden="true" />
            </button>
            <Badge value={edit.status === "disetujui" ? "terverifikasi" : edit.status} label={label} />
          </div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 4 }}>
            Diajukan {edit.pengaju?.full_name || "-"} · {tanggalWaktu(edit.diajukan_at)}
          </div>
        </div>
        {bolehPutus && edit.status === "menunggu" && <TombolKeputusanStatus edit={edit} onSelesai={onSelesai} />}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: TEXT_MID }}>Status</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_MID, textDecoration: "line-through" }}>{LABEL_STATUS_KONSUMEN[edit.status_lama] || edit.status_lama}</span>
        <ArrowRight size={13} color={TEXT_MID} aria-hidden="true" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_DARK, background: ACCENT_SOFT, borderRadius: 999, padding: "2px 10px" }}>
          {LABEL_STATUS_KONSUMEN[edit.status_baru] || edit.status_baru}
        </span>
      </div>
      <div style={{ background: PRIMARY_SOFT, borderRadius: 11, padding: "9px 12px", fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.5 }}>
        <b>Alasan:</b> {edit.alasan}
      </div>
      {edit.status !== "menunggu" && (
        <div style={{ fontSize: 12, color: edit.status === "ditolak" ? NEGATIVE : TEXT_MID, marginTop: 12, lineHeight: 1.5 }}>
          {edit.status === "disetujui" ? "Disetujui" : "Ditolak"} {edit.pemutus?.full_name || ""} · {tanggalWaktu(edit.diputuskan_at)}
          {edit.status === "ditolak" && edit.alasan_tolak ? ` — ${edit.alasan_tolak}` : ""}
        </div>
      )}
    </div>
  );
}

/** Penanda kecil di kartu konsumen selama pengajuan masih menunggu. */
export function PenandaStatusMenunggu({ edit }) {
  if (!edit) return null;
  return (
    <span
      title={`Diajukan ${edit.pengaju?.full_name || "-"}: ${edit.alasan}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}
    >
      <Clock size={10} aria-hidden="true" />
      Menunggu persetujuan: {LABEL_STATUS_KONSUMEN[edit.status_baru]}
    </span>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 7 };

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
