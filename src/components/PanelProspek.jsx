import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRightLeft, Ban, Pencil, ArrowRight, CalendarClock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite, roleOf } from "../lib/permissions";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { tanggal, tanggalRelatif, selisihHari, labelTahap, rupiah } from "../lib/format";
import KontakAksi from "./KontakAksi";
import FollowUpTimeline from "./FollowUpTimeline";
import {
  Drawer,
  Modal,
  PrimaryButton,
  Badge,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  inputStyle,
} from "./ui";

/**
 * Panel prospek — tempat seluruh operasi atas satu prospek berkumpul.
 *
 * Sebelumnya setiap baris tabel memikul empat tombol sekaligus, sementara
 * baris itu sendiri — hal yang paling wajar diklik — tidak melakukan apa pun.
 * Dan dua operasi yang justru penting tidak ada di mana pun: membatalkan
 * prospek beserta alasannya, dan mengalihkannya ke agen lain.
 *
 * Panel, bukan halaman: pekerjaan pada prospek adalah rentetan cepat lintas
 * banyak baris. Daftarnya tetap terlihat di belakang, sehingga posisi gulir
 * dan saringan tidak hilang setiap kali satu prospek selesai ditangani.
 */
export default function PanelProspek({
  lead,
  open,
  onClose,
  onSelesai,
  konsumenId,
  onKonversi,
  onUbahTahap,
  onUbahData,
  sumberLabel,
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [aksi, setAksi] = useState(null); // 'batal' | 'alih'

  useEffect(() => {
    if (!open) setAksi(null);
  }, [open]);

  if (!lead) return null;

  const mayWrite = canWrite(profile, "lead");
  const dibatalkan = lead.status === "cancel";
  const sisa = lead.tanggal_rencana ? selisihHari(lead.tanggal_rencana) : null;

  return (
    <>
      <Drawer open={open} labelledBy="panel-prospek-judul" onClose={onClose} width={470}>
        <>
          {/* Kepala menempel: identitas dan kontak tetap terlihat sambil
              menggulir riwayat yang panjang. */}
          <div style={{ position: "sticky", top: 0, background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: "18px 20px 14px", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 7 }}>
                  <h2 id="panel-prospek-judul" style={{ fontSize: 18, margin: 0, letterSpacing: "-0.01em" }}>
                    {lead.name}
                  </h2>
                  <Badge value={lead.status} label={labelTahap(lead.status)} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap", fontSize: 12.5, color: TEXT_MID }}>
                  <KontakAksi
                    phone={lead.phone}
                    nama={lead.name}
                    tahap={lead.status}
                    leadId={lead.id}
                    onCatat={onSelesai}
                  />
                  {sumberLabel && <span>{sumberLabel}</span>}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Tutup panel"
                style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4, flexShrink: 0 }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div style={{ padding: "16px 20px 24px" }}>
            {dibatalkan && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#FBE9E8", border: "1px solid #F2D3D1", borderRadius: 12, padding: "10px 13px", marginBottom: 16, fontSize: 12.5, color: NEGATIVE, lineHeight: 1.55 }}>
                <Ban size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <span>Prospek ini sudah dibatalkan. Alasannya tercatat di riwayat di bawah.</span>
              </div>
            )}

            {/* Jadwal follow-up naik ke atas: inilah satu-satunya hal di panel
                ini yang menuntut tindakan hari ini. */}
            {!dibatalkan && (
              <div
                style={{
                  background: sisa == null ? PRIMARY_SOFT : sisa < 0 ? "#FBE9E8" : sisa <= 2 ? ACCENT_SOFT : PRIMARY_SOFT,
                  borderRadius: 13,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: sisa != null && sisa < 0 ? NEGATIVE : sisa != null && sisa <= 2 ? ACCENT_DARK : PRIMARY, marginBottom: 5 }}>
                  <CalendarClock size={13} aria-hidden="true" />
                  {sisa == null ? "BELUM DIJADWALKAN" : tanggalRelatif(lead.tanggal_rencana).toUpperCase()}
                </div>
                <div style={{ fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.5 }}>
                  {lead.tanggal_rencana
                    ? `${tanggal(lead.tanggal_rencana)}${lead.rencana_selanjutnya ? ` · ${lead.rencana_selanjutnya}` : ""}`
                    : "Tentukan kapan prospek ini dihubungi lagi lewat Ubah Tahap."}
                </div>
              </div>
            )}

            {/* Aksi berjenjang: satu utama, sisanya sekunder, yang merusak
                dipisah paling bawah. */}
            {mayWrite && !dibatalkan && (
              <div style={{ marginBottom: 18 }}>
                {konsumenId ? (
                  <PrimaryButton onClick={() => navigate(`/konsumen/${konsumenId}`)} style={{ width: "100%", background: PRIMARY }}>
                    Buka Kartu Konsumen <ArrowRight size={14} style={{ marginLeft: 5, verticalAlign: -2 }} />
                  </PrimaryButton>
                ) : (
                  <PrimaryButton onClick={onKonversi} style={{ width: "100%" }}>
                    + Konversi ke Booking
                  </PrimaryButton>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                  <button onClick={onUbahTahap} style={sekunder}>
                    Ubah Tahap
                  </button>
                  <button onClick={onUbahData} style={sekunder}>
                    <Pencil size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
                    Ubah Data
                  </button>
                  <button onClick={() => setAksi("alih")} style={sekunder}>
                    <ArrowRightLeft size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
                    Alihkan Agen
                  </button>
                </div>

                <button onClick={() => setAksi("batal")} style={{ ...sekunder, marginTop: 9, color: NEGATIVE, borderColor: "#F2D3D1" }}>
                  <Ban size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Batalkan Prospek
                </button>
              </div>
            )}

            <Rincian lead={lead} sumberLabel={sumberLabel} />

            <FollowUpTimeline leadId={lead.id} title="Riwayat" />
          </div>
        </>
      </Drawer>

      <ModalBatal
        open={aksi === "batal"}
        lead={lead}
        onClose={() => setAksi(null)}
        onSelesai={() => {
          onSelesai?.();
          onClose?.();
        }}
      />
      <ModalAlih
        open={aksi === "alih"}
        lead={lead}
        onClose={() => setAksi(null)}
        onSelesai={() => {
          onSelesai?.();
          // Setelah dialihkan, prospek bisa keluar dari jangkauan pemilik lama
          // — panel yang tetap terbuka akan menampilkan data yang sudah bukan
          // miliknya lagi.
          if (roleOf(profile) === "sales") onClose?.();
        }}
      />
    </>
  );
}

function Rincian({ lead, sumberLabel }) {
  const baris = [
    ["Sumber", sumberLabel],
    ["Domisili", lead.kecamatan || lead.domisili],
    ["Usia", lead.usia],
    ["Pekerjaan", lead.pekerjaan],
    ["Perusahaan", lead.perusahaan_tempat_kerja],
    ["Penghasilan", lead.gaji ? rupiah(lead.gaji) : null],
    ["Status Nikah", lead.marital_status],
    ["Sosial Media", lead.username_sosmed],
    ["Dibuat", tanggal(lead.created_at)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.04em", marginBottom: 9 }}>RINCIAN</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px 14px" }}>
        {baris.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 12.5, color: TEXT_DARK, wordBreak: "break-word" }}>{v}</div>
          </div>
        ))}
      </div>
      {lead.notes && (
        <div style={{ marginTop: 13 }}>
          <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 3 }}>Catatan</div>
          <div style={{ fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{lead.notes}</div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Batalkan prospek
   ============================================================ */

/**
 * Tujuh alasan pembatalan sudah lama dikonfigurasi di Pengaturan Bisnis,
 * tetapi selama ini hanya terpakai untuk konsumen. Prospek yang mati hanya
 * berubah status, tanpa sebab — sehingga pertanyaan yang paling berguna bagi
 * manajemen, "kenapa kita kehilangan orang dan di tahap mana", tak terjawab.
 */
export function ModalBatal({ open, lead, onClose, onSelesai }) {
  const toast = useToast();
  const alasan = useBusinessSettings("cancel_reason");
  const [pilih, setPilih] = useState("");
  const [detail, setDetail] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setPilih("");
    setDetail("");
    setGalat("");
    setKirim(false);
  }, [open]);

  async function jalankan() {
    if (!pilih) {
      setGalat("Pilih alasan pembatalannya.");
      return;
    }
    setKirim(true);
    setGalat("");
    const { error } = await supabase.rpc("cancel_lead", {
      p_lead_id: lead.id,
      p_reason: pilih,
      p_detail: detail.trim() || null,
    });
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    toast.sukses(`${lead.name} ditandai batal — alasannya tercatat.`);
    segarkanNotifikasi();
    onSelesai?.();
    onClose?.();
  }

  if (!open) return null;

  return (
    <Modal open labelledBy="batal-judul" onClose={() => !kirim && onClose()} width={440}>
      <>
        <div id="batal-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Batalkan Prospek
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.55 }}>
          <b style={{ color: TEXT_DARK }}>{lead.name}</b> akan ditandai batal dan jadwal follow-upnya dikosongkan.
          Alasannya ikut tercatat — itulah yang nanti menjawab kenapa prospek hilang.
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={label}>Alasan</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {withCurrentValue(alasan, pilih).map((a) => {
              const aktif = pilih === a;
              return (
                <button
                  key={a}
                  onClick={() => setPilih(a)}
                  aria-pressed={aktif}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    textAlign: "left",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: `1px solid ${aktif ? NEGATIVE : BORDER}`,
                    background: aktif ? "#FBE9E8" : SURFACE,
                    color: aktif ? NEGATIVE : TEXT_DARK,
                    fontSize: 12.5,
                    fontWeight: aktif ? 600 : 500,
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      border: `1.5px solid ${aktif ? NEGATIVE : BORDER}`,
                      background: aktif ? NEGATIVE : "transparent",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  {a}
                </button>
              );
            })}
            {alasan.length === 0 && (
              <div style={{ fontSize: 12.5, color: TEXT_MID }}>Belum ada daftar alasan. Aturlah di Pengaturan Bisnis.</div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="batal-detail" style={label}>
            Keterangan tambahan
          </label>
          <textarea
            id="batal-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="mis. SLIK menunjukkan tunggakan aktif di leasing"
            style={{ ...inputStyle, minHeight: 66, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={sekunder}>
            Batal
          </button>
          <button
            onClick={jalankan}
            disabled={kirim || !pilih}
            style={{
              border: "none",
              background: pilih ? NEGATIVE : "#C7D3EA",
              color: "#fff",
              borderRadius: 999,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: kirim || !pilih ? "default" : "pointer",
            }}
          >
            {kirim ? "Menyimpan…" : "Batalkan Prospek"}
          </button>
        </div>
      </>
    </Modal>
  );
}

/* ============================================================
   Alihkan agen
   ============================================================ */

/**
 * `leads.assigned_to` selama ini hanya pernah diisi saat baris dibuat. Ketika
 * seorang Sales berhenti atau prospek salah ditugaskan, prospek itu terkunci
 * pada pemiliknya — dan karena RLS menyaring dengan kolom yang sama, ia
 * praktis lenyap dari pandangan semua orang.
 */
export function ModalAlih({ open, lead, onClose, onSelesai }) {
  const toast = useToast();
  const [agen, setAgen] = useState([]);
  const [tujuan, setTujuan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setTujuan("");
    setCatatan("");
    setGalat("");
    setKirim(false);
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setAgen((data || []).filter((p) => p.id !== lead.assigned_to)));
  }, [open, lead]);

  async function jalankan() {
    if (!tujuan) {
      setGalat("Pilih agen tujuannya.");
      return;
    }
    setKirim(true);
    setGalat("");
    const { error } = await supabase.rpc("transfer_lead", {
      p_lead_id: lead.id,
      p_agen_id: tujuan,
      p_catatan: catatan.trim() || null,
    });
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    toast.sukses(`${lead.name} dialihkan ke ${agen.find((a) => a.id === tujuan)?.full_name || "agen baru"}.`);
    onSelesai?.();
    onClose?.();
  }

  if (!open) return null;

  return (
    <Modal open labelledBy="alih-judul" onClose={() => !kirim && onClose()} width={430}>
      <>
        <div id="alih-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Alihkan Prospek
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.55 }}>
          <b style={{ color: TEXT_DARK }}>{lead.name}</b> berpindah ke agen lain beserta seluruh riwayatnya.
          Pengalihannya tercatat, dan setelah ini prospek tidak lagi muncul di daftar agen sebelumnya.
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="alih-agen" style={label}>
            Agen tujuan
          </label>
          <select id="alih-agen" value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={inputStyle}>
            <option value="">— pilih —</option>
            {agen.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="alih-catatan" style={label}>
            Alasan pengalihan
          </label>
          <input
            id="alih-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. Sales A cuti panjang"
            style={inputStyle}
          />
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={sekunder}>
            Batal
          </button>
          <PrimaryButton onClick={jalankan} disabled={kirim || !tujuan}>
            {kirim ? "Memindahkan…" : "Alihkan"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

const label = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 };

const sekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
