import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Image as ImageIcon, UserRoundPlus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { roleOf, canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { uploadFile } from "../lib/storage";
import { jenisBerkas } from "../lib/berkas";
import { tanggal, tanggalWaktu } from "../lib/format";
import { usePratinjau } from "./PratinjauBerkas";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import { PemilihBukti } from "./CatatFollowUpModal";
import { Modal, PrimaryButton, Badge, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, POSITIVE, inputStyle } from "./ui";

/**
 * BI Checking dengan pemohon pengganti (migrasi 028).
 *
 * Hasil SLIK melekat pada NIK. Bila calon pembeli tidak lolos, pengajuan KPR
 * lazim dialihkan ke anggota keluarganya — suami/istri, orang tua, anak, atau
 * saudara kandung — dan itu berarti pemeriksaan baru atas orang lain. Klien
 * membatasinya tiga kali penggantian (paling banyak empat pemeriksaan), dan
 * setiap penggantian diajukan Sales lalu disetujui Admin Sistem, supaya
 * pergantian pemohon tidak terjadi diam-diam.
 *
 * Modul ini berisi bagian yang dipakai bersama BiCheckingModal dan halaman
 * Persetujuan: pilihan hubungan, formulir pengajuan, lampiran per percobaan,
 * dan kartu keputusan.
 */

export const MAKS_PERCOBAAN = 4;

export const HUBUNGAN = [
  { nilai: "suami_istri", label: "Suami/Istri" },
  { nilai: "orang_tua", label: "Orang tua" },
  { nilai: "anak", label: "Anak" },
  { nilai: "saudara_kandung", label: "Saudara kandung" },
  { nilai: "lainnya", label: "Lainnya" },
];

export function labelHubungan(nilai) {
  if (nilai === "diri_sendiri") return "Data asli";
  return HUBUNGAN.find((h) => h.nilai === nilai)?.label || nilai || "-";
}

export const LABEL_HASIL = { lolos: "Lolos", tidak_lolos: "Tidak Lolos", menunggu: "Menunggu hasil" };

export const SELECT_PERCOBAAN =
  "*, leads(name, status), pengaju:profiles!bi_checking_percobaan_diajukan_oleh_fkey(full_name), pemutus:profiles!bi_checking_percobaan_diputuskan_oleh_fkey(full_name), pencatat:profiles!bi_checking_percobaan_hasil_oleh_fkey(full_name)";

export const EVENT_BI = "bi-checking-berubah";

/** Modal BI Checking, antrean Follow Up, halaman Persetujuan, dan lonceng ikut segar. */
export function kabarkanBi(leadId) {
  window.dispatchEvent(new CustomEvent(EVENT_BI, { detail: { leadId } }));
  if (leadId) kabarkanRiwayat({ leadId });
  segarkanNotifikasi();
}

/** "3329010101900001" → "3329 0101 0190 0001" — lebih mudah dicocokkan dengan KTP. */
export function formatNik(nik) {
  return nik ? String(nik).replace(/(\d{4})(?=\d)/g, "$1 ") : "-";
}

/**
 * Lampiran satu percobaan — KTP, KK, dan hasil BI — dengan pratinjau.
 * Hanya baca; berkasnya diunggah lewat formulir yang mencatatnya.
 */
export function LampiranPercobaan({ percobaanId, judul }) {
  const [rows, setRows] = useState([]);
  const [bukaPratinjau, pratinjau] = usePratinjau();

  useEffect(() => {
    if (!percobaanId) return undefined;
    let hidup = true;
    const muat = () =>
      supabase
        .from("berkas_lampiran")
        .select("id, slot, file_url, file_name, uploaded_at")
        .eq("percobaan_id", percobaanId)
        .order("uploaded_at")
        .then(({ data }) => hidup && setRows(data || []));
    muat();
    // Lampiran baru diunggah dari formulir BI Checking.
    window.addEventListener(EVENT_BI, muat);
    return () => {
      hidup = false;
      window.removeEventListener(EVENT_BI, muat);
    };
  }, [percobaanId]);

  if (rows.length === 0) return <span style={{ fontSize: 11, color: TEXT_MID }}>Belum ada lampiran</span>;

  const NAMA_SLOT = { ktp: "KTP", kk: "KK", bi_checking: "Hasil BI" };
  const daftar = rows.map((r) => ({
    bucket: "berkas-lampiran",
    path: r.file_url,
    judul: `${NAMA_SLOT[r.slot] || r.slot}${judul ? ` — ${judul}` : ""}`,
    keterangan: `${r.file_name || "Lampiran"} · ${tanggal(r.uploaded_at)}`,
    nama: r.file_name,
  }));

  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {rows.map((r, i) => {
        const Ikon = jenisBerkas(r.file_name || r.file_url) === "gambar" ? ImageIcon : FileText;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => bukaPratinjau(daftar, i)}
            title={r.file_name || "Buka lampiran"}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${BORDER}`, background: PRIMARY_SOFT, color: PRIMARY, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            <Ikon size={11} aria-hidden="true" />
            {NAMA_SLOT[r.slot] || r.slot}
          </button>
        );
      })}
      {pratinjau}
    </span>
  );
}

/** Formulir pengajuan pemohon pengganti — KTP wajib, KK sebagai bukti hubungan. */
export function AjukanPenggantiBi({ lead, urutanBaru, open, onClose, onSelesai }) {
  const { profile } = useAuth();
  const toast = useToast();
  const langsung = roleOf(profile) === "admin";
  const [nama, setNama] = useState("");
  const [nik, setNik] = useState("");
  const [hubungan, setHubungan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [ktp, setKtp] = useState([]);
  const [kk, setKk] = useState([]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setNama("");
    setNik("");
    setHubungan("");
    setAlasan("");
    setKtp([]);
    setKk([]);
    setGalat("");
    setKirim(false);
  }, [open]);

  if (!lead) return null;
  const ke = (urutanBaru || 2) - 1;

  async function simpan() {
    const angkaNik = nik.replace(/\s/g, "");
    if (!nama.trim()) return setGalat("Isi nama pemohon pengganti sesuai KTP.");
    if (!/^\d{16}$/.test(angkaNik)) return setGalat("NIK harus 16 digit angka.");
    if (!hubungan) return setGalat("Pilih hubungannya dengan prospek.");
    if (!alasan.trim()) return setGalat("Tuliskan alasan penggantian — itulah yang dibaca Admin saat memutuskan.");
    if (ktp.length === 0) return setGalat("Lampirkan KTP pemohon pengganti.");

    setKirim(true);
    setGalat("");
    const berkas = [...ktp.map((f) => ({ f, slot: "ktp" })), ...kk.map((f) => ({ f, slot: "kk" }))];
    const unggahan = await Promise.all(berkas.map((b) => uploadFile("berkas-lampiran", `${lead.id}/${b.slot}`, b.f)));
    const gagal = unggahan.findIndex((u) => u.error || !u.path);
    if (gagal >= 0) {
      setKirim(false);
      setGalat(`"${berkas[gagal].f.name}" gagal diunggah: ${unggahan[gagal].error?.message || "coba lagi."}`);
      return;
    }

    const { data, error } = await supabase.rpc("ajukan_pengganti_bi", {
      p_lead_id: lead.id,
      p_nama: nama.trim(),
      p_nik: angkaNik,
      p_hubungan: hubungan,
      p_alasan: alasan.trim(),
      p_lampiran: unggahan.map((u, i) => ({ path: u.path, nama: berkas[i].f.name, slot: berkas[i].slot })),
    });
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    toast.sukses(
      data?.status === "disetujui"
        ? `Pemohon pengganti ${nama.trim()} disetujui — lanjutkan BI Checking.`
        : "Penggantian data diajukan — menunggu persetujuan Admin Sistem."
    );
    kabarkanBi(lead.id);
    onSelesai?.();
    onClose?.();
  }

  return (
    <Modal open={open} labelledBy="pengganti-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="pengganti-judul" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          <UserRoundPlus size={17} color={PRIMARY} aria-hidden="true" />
          Ajukan Pemohon Pengganti ke-{ke}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
          BI Checking {lead.name} tidak lolos. Pemohon pengganti diperiksa ulang di bank atas NIK-nya sendiri.{" "}
          {langsung
            ? "Sebagai Admin Sistem, pengajuan Anda langsung disetujui dan tetap tercatat."
            : "Pemeriksaan baru bisa dicatat setelah Admin Sistem menyetujui."}{" "}
          Sisa kesempatan setelah ini: <b style={{ color: TEXT_DARK }}>{MAKS_PERCOBAAN - (urutanBaru || 2)}</b>.
        </div>

        <div className="rg-2" style={{ marginBottom: 12 }}>
          <div>
            <label htmlFor="pg-nama" style={labelGaya}>
              Nama Pemohon (sesuai KTP)
            </label>
            <input id="pg-nama" value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pg-nik" style={labelGaya}>
              NIK
            </label>
            <input id="pg-nik" inputMode="numeric" maxLength={19} value={nik} onChange={(e) => setNik(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="16 digit" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={labelGaya}>Hubungan dengan {lead.name}</span>
          <div role="radiogroup" aria-label="Hubungan dengan prospek" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {HUBUNGAN.map((h) => {
              const aktif = hubungan === h.nilai;
              return (
                <button
                  key={h.nilai}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setHubungan(h.nilai)}
                  style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${aktif ? PRIMARY : BORDER}`, background: aktif ? PRIMARY : SURFACE, color: aktif ? "#fff" : TEXT_MID, fontSize: 12.5, fontWeight: aktif ? 600 : 500, cursor: "pointer" }}
                >
                  {h.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="pg-alasan" style={labelGaya}>
            Alasan Penggantian
          </label>
          <input id="pg-alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Pemohon asli kol 5 kartu kredit; KPR diajukan atas nama istri" style={inputStyle} />
        </div>

        <PemilihBukti bukti={ktp} onUbah={setKtp} disabled={kirim} wajib judul="KTP Pemohon Pengganti" />
        <PemilihBukti
          bukti={kk}
          onUbah={setKk}
          disabled={kirim}
          judul="Kartu Keluarga"
          petunjuk="Bukti hubungan keluarga dengan prospek — biasanya diminta bank, dan membantu Admin memutuskan."
        />

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
            {kirim ? "Mengirim…" : langsung ? "Simpan Pengganti" : "Ajukan ke Admin"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

/** Setujui/Tolak; menolak meminta alasan di tempat. */
export function TombolKeputusanPengganti({ edit, onSelesai }) {
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
    const { error } = await supabase.rpc("putuskan_pengganti_bi", { p_id: edit.id, p_setujui: setujui, p_alasan: setujui ? null : alasan.trim() });
    setSibuk(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    kabarkanBi(edit.lead_id);
    toast.sukses(setujui ? `Pemohon pengganti ${edit.nama_pemohon} disetujui.` : "Pengajuan ditolak — pengaju akan melihat alasannya.");
    onSelesai?.();
  }

  if (tolak) {
    return (
      <div style={{ width: "100%" }}>
        <label htmlFor={`tolak-bi-${edit.id}`} style={labelGaya}>
          Alasan penolakan
        </label>
        <textarea
          id={`tolak-bi-${edit.id}`}
          autoFocus
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="mis. KK tidak menunjukkan hubungan keluarga"
          style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }}
        />
        {galat && <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 10 }}>{galat}</div>}
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
      {galat && <div role="alert" style={{ fontSize: 12, color: NEGATIVE, maxWidth: 320, textAlign: "right" }}>{galat}</div>}
    </div>
  );
}

/** Satu pengajuan pemohon pengganti, untuk halaman Persetujuan. */
export function KartuPengganti({ edit, disorot, onSelesai }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const bolehPutus = canWrite(profile, "catatan_putus");
  const label = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" }[edit.persetujuan];

  return (
    <div
      id={`pengajuan-bi-${edit.id}`}
      style={{ background: SURFACE, border: `1px solid ${disorot ? ACCENT_DARK : BORDER}`, boxShadow: disorot ? `0 0 0 1px ${ACCENT_DARK}` : "none", borderRadius: 16, padding: 18, marginBottom: 14 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/follow-up?sorot=${edit.lead_id}`)}
              title="Buka prospek di Follow Up Leads"
              style={{ border: "none", background: "none", padding: 0, fontSize: 15, fontWeight: 700, color: TEXT_DARK, cursor: "pointer", fontFamily: "inherit" }}
            >
              {edit.leads?.name || "Prospek"} <ArrowRight size={13} style={{ verticalAlign: -2, color: TEXT_MID }} aria-hidden="true" />
            </button>
            <Badge value={edit.persetujuan === "disetujui" ? "terverifikasi" : edit.persetujuan} label={label} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT_DARK, background: ACCENT_SOFT, borderRadius: 999, padding: "3px 9px" }}>
              Pengganti ke-{edit.urutan - 1} dari 3
            </span>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 4 }}>
            Diajukan {edit.pengaju?.full_name || "-"} · {tanggalWaktu(edit.diajukan_at)}
          </div>
        </div>
        {bolehPutus && edit.persetujuan === "menunggu" && <TombolKeputusanPengganti edit={edit} onSelesai={onSelesai} />}
      </div>

      <div className="rg-3" style={{ marginBottom: 10, rowGap: 8 }}>
        <Isian label="Pemohon pengganti" nilai={edit.nama_pemohon} />
        <Isian label="NIK" nilai={formatNik(edit.nik)} />
        <Isian label="Hubungan" nilai={labelHubungan(edit.hubungan)} />
      </div>
      <div style={{ background: PRIMARY_SOFT, borderRadius: 11, padding: "9px 12px", fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.5, marginBottom: 10 }}>
        <b>Alasan:</b> {edit.alasan}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: TEXT_MID }}>Lampiran:</span>
        <LampiranPercobaan percobaanId={edit.id} judul={edit.nama_pemohon} />
      </div>
      {edit.persetujuan !== "menunggu" && (
        <div style={{ fontSize: 12, color: edit.persetujuan === "ditolak" ? NEGATIVE : TEXT_MID, marginTop: 12, lineHeight: 1.5 }}>
          {edit.persetujuan === "disetujui" ? "Disetujui" : "Ditolak"} {edit.pemutus?.full_name || ""} · {tanggalWaktu(edit.diputuskan_at)}
          {edit.persetujuan === "ditolak" && edit.alasan_tolak ? ` — ${edit.alasan_tolak}` : ""}
          {edit.hasil && (
            <span style={{ color: edit.hasil === "lolos" ? POSITIVE : edit.hasil === "tidak_lolos" ? NEGATIVE : TEXT_MID, fontWeight: 600 }}>
              {` · Hasil BI: ${LABEL_HASIL[edit.hasil]}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Isian({ label, nilai }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK, wordBreak: "break-word" }}>{nilai || "-"}</div>
    </div>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 };

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
