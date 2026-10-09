import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, FileText, Landmark, KeyRound, Handshake, Image as ImageIcon, Pencil, Clock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { canWrite } from "../lib/permissions";
import { rupiah, tanggalWaktu, tanggal, labelJenisBayar } from "../lib/format";
import { jenisBerkas } from "../lib/berkas";
import { usePratinjau } from "./PratinjauBerkas";
import AjukanUbahCatatan from "./AjukanUbahCatatan";
import TinjauPengajuan from "./TinjauPengajuan";
import { Card, PrimaryButton, DeleteButton, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, inputStyle } from "./ui";

/**
 * Riwayat kronologis (PRD §4.2), digabung dari catatan manusia dan peristiwa
 * sistem.
 *
 * Versi sebelumnya hanya menampilkan catatan yang diketik seseorang, sehingga
 * hal-hal paling menentukan dalam sebuah transaksi properti — kuitansi
 * terverifikasi, berkas masuk bank, SP3K terbit, akad — tidak pernah muncul di
 * garis waktu yang sama. Untuk merekonstruksi urutan kejadian, orang harus
 * membuka tiga layar dan mencocokkannya sendiri.
 *
 * Peristiwa sistem ditandai berbeda dan tidak bisa dihapus: ia bukan catatan,
 * melainkan cerminan data di modul lain.
 */
/**
 * Dikirim setiap kali riwayat sebuah prospek atau konsumen bertambah dari
 * luar komponen ini — Catat Follow Up, Alihkan, Batalkan. Tanpanya, riwayat
 * di panel tetap menampilkan isi lama sampai panel dibuka ulang.
 */
export const EVENT_RIWAYAT = "riwayat-berubah";

export function kabarkanRiwayat({ leadId = null, customerId = null }) {
  window.dispatchEvent(new CustomEvent(EVENT_RIWAYAT, { detail: { leadId, customerId } }));
}

/** "YYYY-MM-DD" menurut jam perangkat — pembanding tanggal_followup. */
function tanggalLokal(nilai) {
  const d = new Date(nilai);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Catatan yang ditulis sistem, bukan manusia — tidak bisa diajukan perubahannya. */
const CATATAN_SISTEM = ["Prospek dibatalkan", "Prospek dialihkan", "Follow-up dijadwal ulang"];

/**
 * @param bisaCatat false menyembunyikan formulir catatan di atas riwayat —
 *   dipakai panel prospek, yang mencatat lewat tombol Catat Follow Up agar
 *   jadwal berikutnya ikut terisi.
 */
export default function FollowUpTimeline({ leadId, customerId, title = "Riwayat Follow Up", bisaCatat = true }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [catatan, setCatatan] = useState([]);
  const [sistem, setSistem] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ activity: "", note: "", hasil: "" });
  const [bukti, setBukti] = useState(new Map());
  const [pengajuan, setPengajuan] = useState(new Map());
  const [ubahCatatan, setUbahCatatan] = useState(null);
  const [lamaTerbuka, setLamaTerbuka] = useState(null);
  const [tinjauId, setTinjauId] = useState(null);
  const [bukaPratinjau, pratinjau] = usePratinjau();

  const hasilOptions = useBusinessSettings("hasil_followup");
  // Riwayat konsumen terbuka bagi semua yang memegangnya. Follow-up yang
  // hanya milik prospek tidak dicatat dari sini sama sekali: ia wajib
  // bertanggal dan berbukti (migrasi 024), jadi satu-satunya pintunya adalah
  // Catat Follow Up.
  const mayWrite = customerId ? canWrite(profile, "followup") : false;
  // Perubahan catatan follow-up prospek diajukan penulisnya (migrasi 025).
  const bolehAjukan = canWrite(profile, "followup_lead");
  const bolehPutus = canWrite(profile, "catatan_putus");

  const fetchRows = useCallback(async () => {
    if (!leadId && !customerId) return;
    setLoading(true);

    // Sebuah konsumen membawa serta riwayat prospek asalnya — hubungan tidak
    // dimulai dari nol pada saat booking.
    const syarat = [leadId ? `lead_id.eq.${leadId}` : null, customerId ? `customer_id.eq.${customerId}` : null]
      .filter(Boolean)
      .join(",");

    const permintaan = [
      supabase.from("lead_activities").select("*, profiles(full_name)").or(syarat).order("created_at", { ascending: false }).limit(200),
    ];

    if (customerId) {
      permintaan.push(
        supabase.from("payments").select("id, payment_type, amount, status, payment_date, created_at").eq("customer_id", customerId),
        supabase.from("customer_documents").select("id, doc_type, status, uploaded_at").eq("customer_id", customerId),
        supabase.from("customer_kpr").select("*").eq("customer_id", customerId).maybeSingle()
      );
    }

    const hasil = await Promise.all(permintaan);
    setLoading(false);

    const [aktivitas, bayar, dokumen, kprRes] = hasil;
    if (aktivitas.error) {
      setError(aktivitas.error.message);
      return;
    }
    setError("");
    setCatatan(aktivitas.data || []);
    setSistem(customerId ? peristiwaSistem(bayar?.data, dokumen?.data, kprRes?.data) : []);

    // Bukti per catatan (migrasi 024). Sebelum migrasinya jalan kolom
    // activity_id belum ada — riwayat tetap tampil, hanya tanpa bukti.
    const ids = (aktivitas.data || []).map((r) => r.id);
    const peta = new Map();
    if (ids.length) {
      const { data: lampiran, error: errLampiran } = await supabase
        .from("berkas_lampiran")
        .select("id, activity_id, file_url, file_name")
        .in("activity_id", ids)
        .order("uploaded_at");
      for (const b of errLampiran ? [] : lampiran || []) {
        if (!peta.has(b.activity_id)) peta.set(b.activity_id, []);
        peta.get(b.activity_id).push(b);
      }
    }
    setBukti(peta);

    // Pengajuan perubahan per catatan, terbaru dulu (migrasi 025). Sebelum
    // migrasinya jalan tabelnya belum ada — riwayat tetap tampil apa adanya.
    const petaUbah = new Map();
    if (ids.length) {
      const { data: ubahan, error: errUbahan } = await supabase
        .from("lead_activity_edits")
        .select("id, activity_id, status, alasan_tolak, lama, diajukan_oleh, diputuskan_at, pemutus:profiles!lead_activity_edits_diputuskan_oleh_fkey(full_name)")
        .in("activity_id", ids)
        .order("diajukan_at", { ascending: false });
      for (const e of errUbahan ? [] : ubahan || []) {
        if (!petaUbah.has(e.activity_id)) petaUbah.set(e.activity_id, []);
        petaUbah.get(e.activity_id).push(e);
      }
    }
    setPengajuan(petaUbah);
  }, [leadId, customerId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    function segarkan(e) {
      const d = e.detail || {};
      if ((leadId && d.leadId === leadId) || (customerId && d.customerId === customerId)) fetchRows();
    }
    window.addEventListener(EVENT_RIWAYAT, segarkan);
    return () => window.removeEventListener(EVENT_RIWAYAT, segarkan);
  }, [fetchRows, leadId, customerId]);

  const gabungan = useMemo(() => {
    const semua = [
      ...catatan.map((r) => {
        // Follow-up yang dicatat mundur diurutkan menurut kapan terjadinya,
        // bukan kapan diketik.
        const mundur = Boolean(r.tanggal_followup) && r.tanggal_followup !== tanggalLokal(r.created_at);
        return {
          id: `a-${r.id}`,
          waktu: mundur ? `${r.tanggal_followup}T12:00:00` : r.created_at,
          mundur,
          judul: r.activity,
          label: r.hasil,
          isi: r.note,
          aktor: r.profiles?.full_name || "Sistem",
          manual: true,
          asli: r,
        };
      }),
      ...sistem,
    ];
    return semua.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  }, [catatan, sistem]);

  async function add() {
    if (!form.activity.trim() && !form.note.trim()) {
      setError("Isi aktivitas atau catatan terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("lead_activities").insert({
      lead_id: leadId || null,
      customer_id: customerId || null,
      actor_id: profile?.id || null,
      activity: form.activity.trim() || "Follow up",
      note: form.note.trim() || null,
      hasil: form.hasil || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      toast.gagal(`Catatan gagal disimpan: ${insertError.message}`);
      return;
    }
    setForm({ activity: "", note: "", hasil: "" });
    toast.sukses("Catatan tersimpan.");
    fetchRows();
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: TEXT_MID }}>
          {catatan.length} catatan
          {sistem.length > 0 && ` · ${sistem.length} peristiwa sistem`}
        </div>
      </div>

      {mayWrite && bisaCatat && (
        <div style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 10 }}>
            <input
              placeholder="Aktivitas (mis. Telepon, WhatsApp, Survei)"
              aria-label="Jenis aktivitas"
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
              style={inputStyle}
            />
            <select value={form.hasil} onChange={(e) => setForm({ ...form, hasil: e.target.value })} aria-label="Hasil follow up" style={inputStyle}>
              <option value="">Hasil Follow Up</option>
              {withCurrentValue(hasilOptions, form.hasil).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <PrimaryButton subject="followup" onClick={add} disabled={saving} style={{ justifySelf: "start" }}>
              {saving ? "Menyimpan…" : "Tambah Catatan"}
            </PrimaryButton>
          </div>
          <textarea
            placeholder="Catatan komunikasi — isi selengkap mungkin, seluruh teks ini dapat dicari lewat kotak pencarian di atas."
            aria-label="Catatan komunikasi"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ ...inputStyle, minHeight: 62, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: NEGATIVE, marginBottom: 10 }}>{error}</div>}

      {loading && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Memuat riwayat…</div>}
      {!loading && gabungan.length === 0 && (
        <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada riwayat komunikasi.</div>
      )}

      <div>
        {gabungan.map((row, i) => {
          const Ikon = row.ikon;
          const terakhir = i === gabungan.length - 1;
          const ubahan = row.manual ? pengajuan.get(row.asli.id) || [] : [];
          const menunggu = ubahan.find((e) => e.status === "menunggu");
          const disetujui = ubahan.find((e) => e.status === "disetujui");
          const ditolakUntukSaya = ubahan[0]?.status === "ditolak" && ubahan[0].diajukan_oleh === profile?.id;
          // Hanya penulisnya, hanya follow-up prospek, dan bukan catatan sistem.
          const bisaUbah =
            row.manual &&
            bolehAjukan &&
            !menunggu &&
            row.asli.lead_id &&
            !row.asli.customer_id &&
            row.asli.actor_id === profile?.id &&
            !CATATAN_SISTEM.includes(row.asli.activity);
          return (
            <div key={row.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: terakhir ? "none" : `1px solid ${BORDER}` }}>
              {/* Rel waktu: satu titik per entri, terbaru di atas. Peristiwa
                  sistem memakai ikon agar terbedakan dari catatan manusia. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 3 }}>
                {row.manual ? (
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      marginTop: 4,
                      borderRadius: "50%",
                      background: i === 0 ? ACCENT : PRIMARY_SOFT,
                      border: `1px solid ${i === 0 ? ACCENT : BORDER}`,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: PRIMARY_SOFT,
                      color: PRIMARY,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ikon size={12} />
                  </span>
                )}
                {!terakhir && <span style={{ flex: 1, width: 1, background: BORDER, marginTop: 4 }} />}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>{row.judul}</span>
                  {row.label && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "3px 9px", borderRadius: 999 }}>
                      {row.label}
                    </span>
                  )}
                  {menunggu && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "3px 9px", borderRadius: 999 }}>
                      <Clock size={10} aria-hidden="true" />
                      Perubahan menunggu persetujuan
                    </span>
                  )}
                  {menunggu && bolehPutus && (
                    <button onClick={() => setTinjauId(menunggu.id)} style={{ ...gayaTautan, color: ACCENT_DARK }}>
                      Tinjau
                    </button>
                  )}
                </div>
                {row.isi && (
                  <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{row.isi}</div>
                )}
                {row.manual && bukti.get(row.asli.id)?.length > 0 && (
                  <BuktiCatatan daftar={bukti.get(row.asli.id)} judul={row.judul} onBuka={bukaPratinjau} />
                )}
                <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 4 }}>
                  {!row.manual
                    ? `Tercatat sistem · ${tanggal(row.waktu)}`
                    : row.mundur
                    ? `${row.aktor} · follow up ${tanggal(row.asli.tanggal_followup)} · dicatat ${tanggalWaktu(row.asli.created_at)}`
                    : `${row.aktor} · ${tanggalWaktu(row.asli.created_at)}`}
                  {disetujui && (
                    <>
                      {` · diubah, disetujui ${disetujui.pemutus?.full_name || "Admin"} ${tanggal(disetujui.diputuskan_at)} · `}
                      <button
                        onClick={() => setLamaTerbuka(lamaTerbuka === row.asli.id ? null : row.asli.id)}
                        style={gayaTautan}
                        aria-expanded={lamaTerbuka === row.asli.id}
                      >
                        {lamaTerbuka === row.asli.id ? "sembunyikan versi lama" : "lihat versi lama"}
                      </button>
                    </>
                  )}
                </div>
                {disetujui && lamaTerbuka === row.asli.id && <VersiLama lama={disetujui.lama} />}
                {ditolakUntukSaya && (
                  <div style={{ fontSize: 11.5, color: NEGATIVE, marginTop: 5, lineHeight: 1.45 }}>
                    Pengajuan perubahan ditolak: {ubahan[0].alasan_tolak}
                  </div>
                )}
              </div>

              {row.manual && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flexShrink: 0 }}>
                  {bisaUbah && (
                    <button
                      onClick={() => setUbahCatatan(row.asli)}
                      title={bolehPutus ? "Ubah catatan" : "Ajukan perubahan — berlaku setelah disetujui Admin"}
                      aria-label="Ubah catatan"
                      style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 6, lineHeight: 0, borderRadius: 8 }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <DeleteButton
                    ikon
                    subject="followup_delete"
                    itemName={row.judul}
                    onDelete={() => supabase.from("lead_activities").delete().eq("id", row.asli.id)}
                    onDone={fetchRows}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pratinjau}
      <AjukanUbahCatatan catatan={ubahCatatan} open={Boolean(ubahCatatan)} onClose={() => setUbahCatatan(null)} onSelesai={fetchRows} />
      <TinjauPengajuan editId={tinjauId} open={Boolean(tinjauId)} onClose={() => setTinjauId(null)} />
    </Card>
  );
}

/** Isi catatan sebelum perubahan terakhir yang disetujui. */
function VersiLama({ lama }) {
  const l = lama || {};
  return (
    <div style={{ marginTop: 7, background: "#F7F9FC", border: `1px dashed ${BORDER}`, borderRadius: 10, padding: "8px 11px", fontSize: 12, color: TEXT_MID, lineHeight: 1.5 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 3 }}>VERSI SEBELUMNYA</div>
      <div>
        <b style={{ color: TEXT_DARK }}>{l.activity || "-"}</b>
        {l.hasil ? ` · ${l.hasil}` : ""}
        {l.tanggal_followup ? ` · follow up ${tanggal(l.tanggal_followup)}` : ""}
      </div>
      {l.note && <div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{l.note}</div>}
    </div>
  );
}

const gayaTautan = { border: "none", background: "none", padding: 0, color: PRIMARY, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

/** Bukti sebuah catatan follow-up — klik untuk membuka pratinjaunya. */
function BuktiCatatan({ daftar, judul, onBuka }) {
  const item = daftar.map((b) => ({ bucket: "berkas-lampiran", path: b.file_url, judul: `Bukti — ${judul}`, keterangan: b.file_name || "Bukti", nama: b.file_name }));
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
      {daftar.map((b, i) => {
        const Ikon = jenisBerkas(b.file_name || b.file_url) === "gambar" ? ImageIcon : FileText;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onBuka(item, i)}
            title={b.file_name || "Buka bukti"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              maxWidth: 200,
              border: `1px solid ${BORDER}`,
              background: PRIMARY_SOFT,
              color: PRIMARY,
              borderRadius: 8,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Ikon size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.file_name || `Bukti ${i + 1}`}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Menurunkan peristiwa dari data modul lain.
 *
 * Sengaja diturunkan saat render, bukan disimpan sebagai baris riwayat: kalau
 * disalin ke tabel sendiri, ia akan menyimpang begitu data aslinya dikoreksi.
 */
function peristiwaSistem(payments, documents, kpr) {
  const hasil = [];

  for (const p of payments || []) {
    if (p.status === "terverifikasi") {
      hasil.push({
        id: `p-${p.id}`,
        waktu: p.payment_date || p.created_at,
        judul: `${labelJenisBayar(p.payment_type)} terverifikasi`,
        isi: `${rupiah(p.amount)} — kuitansi resmi sudah diunggah Finance.`,
        ikon: Wallet,
        manual: false,
      });
    } else {
      hasil.push({
        id: `p-${p.id}`,
        waktu: p.payment_date || p.created_at,
        judul: `${labelJenisBayar(p.payment_type)} dicatat`,
        isi: `${rupiah(p.amount)} — menunggu verifikasi Finance.`,
        ikon: Wallet,
        manual: false,
      });
    }
  }

  for (const d of documents || []) {
    hasil.push({
      id: `d-${d.id}`,
      waktu: d.uploaded_at,
      judul: `Dokumen ${d.doc_type} diunggah`,
      isi: d.status === "ditolak" ? "Ditolak — perlu diunggah ulang." : d.status === "terverifikasi" ? "Sudah diverifikasi." : "Menunggu verifikasi.",
      ikon: FileText,
      manual: false,
    });
  }

  const tonggak = [
    { key: "tanggal_masuk_bank", judul: "Berkas masuk bank", ikon: Landmark },
    { key: "tanggal_sp3k_terbit", judul: "SP3K terbit", ikon: FileText },
    { key: "tanggal_akad", judul: "Akad", ikon: Handshake },
    { key: "tanggal_serah_terima_kunci", judul: "Serah terima kunci", ikon: KeyRound },
  ];

  for (const t of tonggak) {
    if (kpr?.[t.key]) {
      hasil.push({
        id: `k-${t.key}`,
        waktu: kpr[t.key],
        judul: t.judul,
        isi: t.key === "tanggal_masuk_bank" && kpr.nama_bank ? kpr.nama_bank : null,
        ikon: t.ikon,
        manual: false,
      });
    }
  }

  return hasil;
}
