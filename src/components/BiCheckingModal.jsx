import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, AlertTriangle, Clock, UserRoundPlus, Ban } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { roleOf } from "../lib/permissions";
import { hariIni, tanggal, tanggalWaktu } from "../lib/format";
import { uploadFile } from "../lib/storage";
import { PemilihBukti } from "./CatatFollowUpModal";
import {
  MAKS_PERCOBAAN,
  LABEL_HASIL,
  SELECT_PERCOBAAN,
  EVENT_BI,
  kabarkanBi,
  labelHubungan,
  formatNik,
  LampiranPercobaan,
  AjukanPenggantiBi,
} from "./PenggantiBi";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE, POSITIVE, ACCENT_DARK, ACCENT_SOFT, inputStyle } from "./ui";

/**
 * BI Checking (SLIK) — langkah terakhir sebelum booking.
 *
 * Setiap pemeriksaan adalah satu percobaan atas satu pemohon: pertama data
 * asli prospek, lalu — bila tidak lolos — paling banyak tiga pemohon pengganti
 * (suami/istri, orang tua, anak, saudara) yang masing-masing diajukan Sales
 * dan disetujui Admin Sistem (migrasi 028). Seluruh percobaan tampil di sini
 * berurutan, lengkap dengan KTP, KK, hasil, dan siapa yang mencatatnya.
 *
 * Hasil Lolos/Tidak Lolos tidak bisa ditimpa: yang gagal diperiksa ulang lewat
 * pemohon pengganti. Percobaan keempat yang tidak lolos membatalkan prospek
 * otomatis dengan alasan "Tidak lolos BI-Checking". Prospek yang lolos dengan
 * pemohon pengganti dibooking atas nama pemohon itu.
 */

const PILIHAN = [
  { nilai: "lolos", label: "Lolos", ikon: ShieldCheck, warna: POSITIVE, latar: "#E4F2E8" },
  { nilai: "tidak_lolos", label: "Tidak Lolos", ikon: AlertTriangle, warna: NEGATIVE, latar: "#FBE9E8" },
  { nilai: "menunggu", label: "Menunggu hasil", ikon: Clock, warna: ACCENT_DARK, latar: ACCENT_SOFT },
];

const WARNA_HASIL = { lolos: POSITIVE, tidak_lolos: NEGATIVE, menunggu: ACCENT_DARK };

export default function BiCheckingModal({ lead, open, onClose, onSelesai }) {
  const toast = useToast();
  const { profile } = useAuth();
  const adminSistem = roleOf(profile) === "admin";

  const [percobaan, setPercobaan] = useState(null);
  const [status, setStatus] = useState("");
  const [tgl, setTgl] = useState(hariIni());
  const [keterangan, setKeterangan] = useState("");
  const [nik, setNik] = useState("");
  const [ktp, setKtp] = useState([]);
  const [hasilBi, setHasilBi] = useState([]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");
  const [ajukan, setAjukan] = useState(false);

  async function muat() {
    if (!lead) return;
    const { data, error } = await supabase.from("bi_checking_percobaan").select(SELECT_PERCOBAAN).eq("lead_id", lead.id).order("urutan").order("diajukan_at");
    // Sebelum migrasi 028 tabelnya belum ada: tampil sebagai belum ada percobaan.
    setPercobaan(error ? [] : data || []);
  }

  useEffect(() => {
    if (!open || !lead) return undefined;
    setPercobaan(null);
    muat();
    const dengar = (e) => {
      if (!e.detail?.leadId || e.detail.leadId === lead.id) muat();
    };
    window.addEventListener(EVENT_BI, dengar);
    return () => window.removeEventListener(EVENT_BI, dengar);
  }, [open, lead?.id]);

  const disetujui = useMemo(() => (percobaan || []).filter((p) => p.persetujuan === "disetujui"), [percobaan]);
  const aktif = disetujui.length ? disetujui[disetujui.length - 1] : null;
  const menunggu = (percobaan || []).find((p) => p.persetujuan === "menunggu") || null;
  const urutanAktif = aktif?.urutan || 1;
  const sisa = Math.max(0, MAKS_PERCOBAAN - urutanAktif);
  const dibatalkan = lead?.status === "cancel";
  const final = aktif && ["lolos", "tidak_lolos"].includes(aktif.hasil);
  // Yang boleh dicatat: belum ada percobaan, percobaan berjalan belum punya
  // hasil akhir, atau Admin Sistem mengoreksi.
  const bolehCatat = !dibatalkan && !menunggu && (!final || adminSistem);

  useEffect(() => {
    if (!open || !lead || percobaan === null) return;
    setStatus(aktif?.hasil === "menunggu" ? "menunggu" : aktif && final && adminSistem ? aktif.hasil : "");
    setTgl(aktif?.tanggal_periksa || hariIni());
    setKeterangan(aktif?.catatan_hasil || "");
    setNik("");
    setKtp([]);
    setHasilBi([]);
    setGalat("");
    setKirim(false);
  }, [open, lead?.id, percobaan === null, aktif?.id]);

  async function simpan() {
    if (!status) return setGalat("Pilih hasil BI Checking: Lolos, Tidak Lolos, atau Menunggu hasil.");
    if (!tgl) return setGalat("Isi tanggal pemeriksaan.");
    if (tgl > hariIni()) return setGalat("Tanggal pemeriksaan tidak boleh melewati hari ini.");
    if (status !== "menunggu" && !keterangan.trim()) {
      return setGalat("Tulis keterangan hasil BI Checking — mis. kolektibilitas, nama bank, alasan tidak lolos.");
    }
    const angkaNik = nik.replace(/\s/g, "");
    if (angkaNik && !/^\d{16}$/.test(angkaNik)) return setGalat("NIK harus 16 digit angka.");

    setKirim(true);
    setGalat("");

    // Berkas diunggah lebih dulu; barisnya ditulis setelah percobaannya pasti.
    const berkas = [...ktp.map((f) => ({ f, slot: "ktp" })), ...hasilBi.map((f) => ({ f, slot: "bi_checking" }))];
    const unggahan = await Promise.all(berkas.map((b) => uploadFile("berkas-lampiran", `${lead.id}/${b.slot}`, b.f)));
    const gagal = unggahan.findIndex((u) => u.error || !u.path);
    if (gagal >= 0) {
      setKirim(false);
      setGalat(`"${berkas[gagal].f.name}" gagal diunggah: ${unggahan[gagal].error?.message || "coba lagi."}`);
      return;
    }

    const { data, error } = await supabase.rpc("catat_bi_checking", {
      p_lead_id: lead.id,
      p_status: status,
      p_tanggal: tgl,
      p_catatan: keterangan.trim() || null,
      p_nik: angkaNik || null,
    });
    if (error) {
      setKirim(false);
      setGalat(error.message);
      return;
    }

    if (berkas.length > 0) {
      const { error: errLampiran } = await supabase.from("berkas_lampiran").insert(
        unggahan.map((u, i) => ({ lead_id: lead.id, slot: berkas[i].slot, file_url: u.path, file_name: berkas[i].f.name, percobaan_id: data?.percobaan_id }))
      );
      if (errLampiran) toast.gagal(`Hasil tersimpan, tetapi lampiran gagal dicatat: ${errLampiran.message}`);
    }

    setKirim(false);
    kabarkanBi(lead.id);
    if (data?.gagal_total) {
      toast.gagal(`${lead.name} gagal total BI Checking setelah ${data.urutan} pemeriksaan — prospek dibatalkan otomatis.`);
    } else if (status === "lolos") {
      toast.sukses(`${lead.name} lolos BI Checking — siap dikonversi ke Booking.`);
    } else if (status === "tidak_lolos") {
      toast.sukses(`BI Checking tidak lolos tercatat. Sisa penggantian data: ${data?.sisa_penggantian ?? 0}.`);
    } else {
      toast.sukses(`BI Checking ${lead.name} dicatat, menunggu hasil.`);
    }
    onSelesai?.();
    if (status !== "tidak_lolos" || data?.gagal_total) onClose?.();
  }

  if (!lead) return null;

  return (
    <>
    {/* Formulir pengganti di luar jendela ini, bukan di dalamnya: Escape pada
        jendela yang bertumpuk tidak boleh ikut menutup keduanya. */}
    <Modal open={open && !ajukan} labelledBy="bi-judul" onClose={() => !kirim && onClose?.()} width={580}>
      <>
        <div id="bi-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          BI Checking — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>
          Pemeriksaan SLIK di bank sebelum booking. Bila tidak lolos, data pemohon boleh diganti paling banyak 3 kali (mis. KTP
          suami/istri atau saudara), masing-masing dengan persetujuan Admin Sistem.
        </div>

        {percobaan === null ? (
          <div style={{ fontSize: 13, color: TEXT_MID, padding: "10px 0" }}>Memuat riwayat BI Checking…</div>
        ) : (
          <>
            {/* Pemohon yang sedang diperiksa dan sisa kesempatannya. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: PRIMARY_SOFT, borderRadius: 13, padding: "11px 14px", marginBottom: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, letterSpacing: "0.04em" }}>PEMOHON YANG DIPERIKSA</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginTop: 2 }}>
                  {menunggu ? `${menunggu.nama_pemohon} (menunggu persetujuan)` : aktif?.nama_pemohon || lead.name}
                  <span style={{ fontSize: 12, fontWeight: 500, color: TEXT_MID }}> · {labelHubungan((menunggu || aktif)?.hubungan || "diri_sendiri")}</span>
                </div>
              </div>
              <Kesempatan dipakai={menunggu ? menunggu.urutan : percobaan.length ? urutanAktif : 0} />
            </div>

            {percobaan.length > 0 && <RiwayatPercobaan daftar={percobaan} />}

            {dibatalkan ? (
              <Pesan ikon={Ban} warna={NEGATIVE} latar="#FBE9E8">
                Prospek ini sudah dibatalkan
                {aktif?.hasil === "tidak_lolos" && aktif.urutan >= MAKS_PERCOBAAN ? " — gagal total setelah data asli dan 3 pemohon pengganti tidak lolos." : "."}
              </Pesan>
            ) : menunggu ? (
              <Pesan ikon={Clock} warna={ACCENT_DARK} latar={ACCENT_SOFT}>
                Pemohon pengganti ke-{menunggu.urutan - 1}, <b>{menunggu.nama_pemohon}</b>, menunggu persetujuan Admin Sistem. BI Checking-nya bisa
                dicatat setelah disetujui.
              </Pesan>
            ) : final && !adminSistem ? (
              aktif.hasil === "lolos" ? (
                <Pesan ikon={ShieldCheck} warna={POSITIVE} latar="#E4F2E8">
                  {aktif.nama_pemohon} lolos BI Checking — prospek siap dikonversi ke Booking
                  {aktif.urutan > 1 ? `, atas nama ${aktif.nama_pemohon}` : ""}.
                </Pesan>
              ) : (
                <>
                  <Pesan ikon={AlertTriangle} warna={NEGATIVE} latar="#FBE9E8">
                    {aktif.nama_pemohon} tidak lolos. Sisa penggantian data: <b>{sisa}</b> dari 3. Booking tidak bisa dicatat sampai ada pemohon
                    yang lolos.
                  </Pesan>
                  {sisa > 0 && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                      <PrimaryButton subject="followup_lead" onClick={() => setAjukan(true)}>
                        <UserRoundPlus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        Ajukan Penggantian Data
                      </PrimaryButton>
                    </div>
                  )}
                </>
              )
            ) : null}

            {bolehCatat && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: PRIMARY, letterSpacing: "0.03em", marginBottom: 11 }}>
                  {final ? "KOREKSI HASIL (ADMIN SISTEM)" : `HASIL PEMERIKSAAN${aktif && aktif.urutan > 1 ? ` · PENGGANTI KE-${aktif.urutan - 1}` : ""}`}
                </div>

                <div role="radiogroup" aria-label="Hasil BI Checking" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {PILIHAN.map((p) => {
                    const pilih = status === p.nilai;
                    return (
                      <button
                        key={p.nilai}
                        type="button"
                        role="radio"
                        aria-checked={pilih}
                        onClick={() => setStatus(p.nilai)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 14px",
                          borderRadius: 999,
                          border: `1px solid ${pilih ? p.warna : BORDER}`,
                          background: pilih ? p.latar : SURFACE,
                          color: pilih ? p.warna : TEXT_MID,
                          fontSize: 12.5,
                          fontWeight: pilih ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        <p.ikon size={13} aria-hidden="true" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="rg-2" style={{ marginBottom: 12 }}>
                  <div>
                    <label htmlFor="bi-tgl" style={labelGaya}>
                      Tanggal Pemeriksaan
                    </label>
                    <input id="bi-tgl" type="date" value={tgl} max={hariIni()} onChange={(e) => setTgl(e.target.value)} style={inputStyle} />
                  </div>
                  {/* NIK data asli boleh dilengkapi di sini; NIK pengganti sudah
                      tercatat saat diajukan. */}
                  {(!aktif || (aktif.urutan === 1 && !aktif.nik)) && (
                    <div>
                      <label htmlFor="bi-nik" style={labelGaya}>
                        NIK {lead.name} <span style={{ fontWeight: 400 }}>(opsional)</span>
                      </label>
                      <input id="bi-nik" inputMode="numeric" maxLength={19} value={nik} onChange={(e) => setNik(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="16 digit" style={inputStyle} />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="bi-ket" style={labelGaya}>
                    Keterangan Hasil BI Checking
                  </label>
                  <textarea
                    id="bi-ket"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    placeholder="mis. Kolektibilitas 1 di BTN · atau: tunggakan kartu kredit, kol 5"
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>

                <PemilihBukti
                  bukti={ktp}
                  onUbah={setKtp}
                  disabled={kirim}
                  judul={`KTP ${aktif && aktif.urutan > 1 ? "pemohon (tambahan)" : lead.name}`}
                  petunjuk={aktif && aktif.urutan > 1 ? "KTP pemohon pengganti sudah dilampirkan saat diajukan." : "KTP yang dibawa ke bank untuk pemeriksaan SLIK."}
                />
                <PemilihBukti bukti={hasilBi} onUbah={setHasilBi} disabled={kirim} judul="Hasil BI Checking" petunjuk="Hasil pemeriksaan SLIK dari bank." />

                {status === "tidak_lolos" && !final && (
                  <div style={{ fontSize: 12, color: NEGATIVE, lineHeight: 1.5, marginBottom: 10 }}>
                    {urutanAktif >= MAKS_PERCOBAAN
                      ? "Ini kesempatan terakhir. Bila disimpan Tidak Lolos, prospek dinyatakan gagal total dan dibatalkan otomatis."
                      : `Setelah disimpan, Anda bisa mengajukan penggantian data pemohon (sisa ${sisa} kali).`}
                  </div>
                )}

                {galat && (
                  <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 10, lineHeight: 1.5 }}>
                    {galat}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <PrimaryButton subject="followup_lead" onClick={simpan} disabled={kirim}>
                    {kirim ? "Menyimpan…" : "Simpan Hasil BI Checking"}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Tutup
          </button>
        </div>
      </>
    </Modal>

    <AjukanPenggantiBi
      lead={lead}
      urutanBaru={urutanAktif + 1}
      open={open && ajukan}
      onClose={() => setAjukan(false)}
      onSelesai={() => {
        muat();
        onSelesai?.();
      }}
    />
    </>
  );
}

/** Empat titik: data asli + tiga pengganti. */
function Kesempatan({ dipakai }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 4 }} aria-hidden="true">
        {Array.from({ length: MAKS_PERCOBAAN }, (_, i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < dipakai ? (i === 0 ? PRIMARY : ACCENT_DARK) : "#D7DEEA" }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: TEXT_MID }}>
        Pemeriksaan {Math.max(dipakai, 1)} dari {MAKS_PERCOBAAN} · sisa pengganti {Math.max(0, MAKS_PERCOBAAN - Math.max(dipakai, 1))}
      </div>
    </div>
  );
}

/** Seluruh percobaan, berurutan — termasuk pengajuan yang ditolak Admin. */
function RiwayatPercobaan({ daftar }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.03em", marginBottom: 7 }}>RIWAYAT PEMERIKSAAN</div>
      <div style={{ display: "grid", gap: 7 }}>
        {daftar.map((p) => {
          const ditolak = p.persetujuan === "ditolak";
          return (
            <div key={p.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 11, padding: "9px 12px", background: ditolak ? "#FAFAFB" : SURFACE, opacity: ditolak ? 0.85 : 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_MID }}>{p.urutan === 1 ? "DATA ASLI" : `PENGGANTI KE-${p.urutan - 1}`}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_DARK }}>{p.nama_pemohon}</span>
                <span style={{ fontSize: 11.5, color: TEXT_MID }}>
                  {labelHubungan(p.hubungan)}
                  {p.nik ? ` · NIK ${formatNik(p.nik)}` : ""}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: ditolak ? NEGATIVE : p.persetujuan === "menunggu" ? ACCENT_DARK : WARNA_HASIL[p.hasil] || TEXT_MID }}>
                  {ditolak ? "Pengajuan ditolak" : p.persetujuan === "menunggu" ? "Menunggu persetujuan" : p.hasil ? LABEL_HASIL[p.hasil] : "Belum diperiksa"}
                </span>
              </div>
              {p.urutan > 1 && (
                <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 3, lineHeight: 1.45 }}>
                  Alasan: {p.alasan} · diajukan {p.pengaju?.full_name || "-"} {tanggalWaktu(p.diajukan_at)}
                  {p.persetujuan !== "menunggu" && ` · ${ditolak ? "ditolak" : "disetujui"} ${p.pemutus?.full_name || ""}`}
                  {ditolak && p.alasan_tolak ? ` — ${p.alasan_tolak}` : ""}
                </div>
              )}
              {p.hasil && !ditolak && (
                <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 3, lineHeight: 1.45 }}>
                  {p.tanggal_periksa ? `Diperiksa ${tanggal(p.tanggal_periksa)}` : ""}
                  {p.catatan_hasil ? ` · ${p.catatan_hasil}` : ""}
                  {p.pencatat?.full_name ? ` · dicatat ${p.pencatat.full_name}` : ""}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <LampiranPercobaan percobaanId={p.id} judul={p.nama_pemohon} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pesan({ ikon: Ikon, warna, latar, children }) {
  return (
    <div role="status" style={{ display: "flex", gap: 9, alignItems: "flex-start", background: latar, borderRadius: 12, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: warna, lineHeight: 1.5 }}>
      <Ikon size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
