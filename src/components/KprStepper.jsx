import React, { useMemo, useState } from "react";
import { Check, Lock, AlertTriangle, ChevronDown, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { rupiah, tanggal, selisihHari } from "../lib/format";
import InputRupiah from "./InputRupiah";
import LampiranTahap from "./LampiranTahap";
import VerifikasiPembayaran from "./VerifikasiPembayaran";
import BerkasBankPanel from "./BerkasBankPanel";
import {
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  POSITIVE,
  NEGATIVE,
  inputStyle,
} from "./ui";

/**
 * Progres KPR sebagai tahapan, bukan formulir.
 *
 * Perubahan terbesar dari BRIEF: SARINGAN AWAL PINDAH KE DEPAN BOOKING.
 *
 * Sebelumnya urutannya Booking → DP → Saringan Awal → Bank, artinya survei dan
 * BI-Checking dicatat setelah uang booking berpindah tangan. Padahal dua dari
 * tujuh alasan pembatalan yang dikonfigurasi di sistem ini — "Tidak lolos
 * BI-Checking" dan "RPC tidak cukup" — sudah bisa diketahui sebelum booking
 * diterima. Menaruh saringannya di belakang berarti setiap kegagalan yang
 * sebenarnya bisa dicegah berubah menjadi pengembalian uang.
 *
 * Urutannya kini: Survei → Saringan Awal → Booking → DP → Bank → SP3K → Akad →
 * Serah Terima → BPHTB → SHM, persis seperti alur yang dijabarkan brief.
 *
 * Tahap aktif tetap dihitung dari data yang sudah terisi — tidak ada kolom
 * status terpisah, sehingga status dan isi tidak mungkin saling bertentangan.
 */

const LABEL_BI = { menunggu: "menunggu", lolos: "lolos", tidak_lolos: "TIDAK LOLOS" };

/**
 * Rasio angsuran terhadap penghasilan.
 *
 * Patokan lazim KPR subsidi: angsuran tidak lebih dari sepertiga penghasilan.
 * Angsurannya sendiri tidak lagi diisi di sini — BRIEF §Saringan Awal
 * menyatakan "Perkiraan Angsuran/Bulan (Belum diperlukan)" — tetapi berkas
 * lama yang sudah mencatatnya tetap dihitung, karena peringatannya masih benar.
 */
const BATAS_RPC = 1 / 3;

function rasioRpc(k) {
  const p = Number(k?.penghasilan_verifikasi);
  const a = Number(k?.angsuran_bulanan);
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return null;
  return a / p;
}

/** Nilai kosong ditulis strip, bukan dibiarkan hilang (BRIEF §Saringan Awal). */
function atauStrip(v) {
  return v === null || v === undefined || String(v).trim() === "" ? "-" : v;
}

const TAHAP = [
  {
    // BRIEF §Progres KPR: "leads > Follow up {jika berminat} > survei
    // {melampirkan foto survei, Tanggal Survei} > BI checking > … > Booking".
    kunci: "survei",
    label: "Survei",
    selesai: (k) => Boolean(k.tanggal_survei),
    ringkas: (k) => tanggal(k.tanggal_survei),
    bidang: [
      { key: "tanggal_survei", label: "Tanggal Survei", tipe: "date" },
      { key: "catatan_survei", label: "Catatan Survei", tipe: "text", lebar: 2 },
    ],
    lampiran: [{ slot: "survei", label: "Foto Survei", hint: "Foto lokasi saat survei bersama calon pembeli." }],
  },
  {
    kunci: "saring",
    label: "Saringan Awal",
    selesai: (k) => k.bi_checking_status === "lolos",
    ringkas: (k) =>
      [
        k.bi_checking_status ? `BI-Checking ${LABEL_BI[k.bi_checking_status] || k.bi_checking_status}` : null,
        rasioRpc(k) != null ? `RPC ${Math.round(rasioRpc(k) * 100)}%` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    bidang: [
      { key: "bi_checking_status", label: "Hasil BI-Checking", tipe: "bi" },
      { key: "bi_checking_tanggal", label: "Tanggal Pemeriksaan", tipe: "date" },
      { key: "bi_checking_catatan", label: "Catatan", tipe: "text", strip: true },
    ],
    lampiran: [{ slot: "bi_checking", label: "Hasil BI-Checking", hint: "Lampirkan hasil pemeriksaan SLIK dari bank." }],
    // Penghasilan terverifikasi sengaja tidak ada di sini lagi: BRIEF
    // memindahkannya ke data diri konsumen, tempat ia memang dipakai berulang.
    catatan: "Penghasilan terverifikasi kini ada di Ringkasan → Data Diri konsumen.",
  },
  {
    kunci: "booking",
    label: "Booking",
    selesai: (k) => Boolean(k.tanggal_booking),
    ringkas: (k) => [tanggal(k.tanggal_booking), rupiah(k.nominal_booking)].filter((v) => v !== "-").join(" · "),
    bidang: [
      { key: "tanggal_booking", label: "Tanggal Booking", tipe: "date" },
      { key: "nominal_booking", label: "Nominal Booking", tipe: "rupiah", cepat: [3e6, 5e6, 7e6, 10e6] },
    ],
    pembayaran: "booking",
  },
  {
    kunci: "dp",
    label: "DP",
    selesai: (k) => Boolean(k.tanggal_dp),
    ringkas: (k) => [tanggal(k.tanggal_dp), rupiah(k.nominal_total_dp || k.nominal_dp)].filter((v) => v !== "-").join(" · "),
    bidang: [
      { key: "tanggal_dp", label: "Tanggal Pembayaran DP", tipe: "date" },
      { key: "nominal_dp", label: "Nominal DP (Promo)", tipe: "rupiah" },
      { key: "biaya_tambahan_tanah", label: "Biaya Tambahan Tanah", tipe: "rupiah" },
      // BRIEF §DP: "Tambahkan akumulasi otomatis dari Nominal DP + Biaya Tanah
      // untuk di Total DP". Dihitung, jadi dibaca saja — mengetiknya sendiri
      // hanya menciptakan kemungkinan angkanya tidak cocok.
      { key: "nominal_total_dp", label: "Total DP (Promo + Tanah)", tipe: "hitung" },
      { key: "dp_terbayar", label: "DP Terbayar", tipe: "rupiah" },
    ],
    pembayaran: "dp",
  },
  {
    kunci: "bank",
    label: "Bank",
    selesai: (k) => Boolean(k.tanggal_masuk_bank),
    ringkas: (k) => [k.nama_bank, tanggal(k.tanggal_masuk_bank), k.progres_berkas].filter((v) => v && v !== "-").join(" · "),
    bidang: [
      { key: "nama_bank", label: "Nama Bank", tipe: "bank" },
      { key: "tanggal_masuk_bank", label: "Tanggal Masuk Bank", tipe: "date" },
      { key: "progres_berkas", label: "Progres Berkas", tipe: "progres" },
    ],
    // BRIEF §Bank: attach dokumen dipindahkan ke dalam section Bank, dengan
    // penomoran dan daftar yang kurang di atas daftar yang sudah ada.
    berkasBank: true,
  },
  {
    kunci: "sp3k",
    label: "SP3K",
    selesai: (k) => Boolean(k.tanggal_sp3k_terbit),
    ringkas: (k) =>
      [tanggal(k.tanggal_sp3k_terbit), k.tanggal_sp3k_expired ? `berlaku s/d ${tanggal(k.tanggal_sp3k_expired)}` : null]
        .filter((v) => v && v !== "-")
        .join(" · "),
    bidang: [
      { key: "tanggal_sp3k_terbit", label: "Tanggal SP3K Terbit", tipe: "date" },
      { key: "tanggal_sp3k_expired", label: "Tanggal SP3K Expired", tipe: "date" },
      { key: "tanggal_sp3k_perpanjangan", label: "Tanggal SP3K Perpanjangan", tipe: "date" },
    ],
    // Dua lampiran terpisah, sesuai permintaan brief "input dokumen per
    // section": SP3K perpanjangan adalah surat yang berbeda dari SP3K aslinya,
    // dan satu kotak lampiran akan membuat keduanya tercampur.
    lampiran: [
      { slot: "sp3k_terbit", label: "Dokumen SP3K" },
      { slot: "sp3k_perpanjangan", label: "Dokumen SP3K Perpanjangan", hint: "Diisi bila SP3K diperpanjang." },
    ],
  },
  {
    kunci: "akad",
    label: "Akad",
    selesai: (k) => Boolean(k.tanggal_akad),
    ringkas: (k) => tanggal(k.tanggal_akad),
    bidang: [{ key: "tanggal_akad", label: "Tanggal Akad", tipe: "date" }],
    lampiran: [{ slot: "akad", label: "Dokumentasi Akad", hint: "Foto atau salinan dokumen akad." }],
  },
  {
    kunci: "serah",
    label: "Serah Terima",
    selesai: (k) => Boolean(k.tanggal_serah_terima_kunci),
    ringkas: (k) => tanggal(k.tanggal_serah_terima_kunci),
    bidang: [{ key: "tanggal_serah_terima_kunci", label: "Tanggal Serah Terima Kunci", tipe: "date" }],
    lampiran: [{ slot: "berita_acara", label: "Berita Acara Serah Terima", hint: "Unggah berita acara dalam bentuk PDF." }],
  },
  {
    kunci: "bphtb",
    label: "BPHTB",
    // Yang menyelesaikan tahap ini adalah keputusannya, bukan nominalnya:
    // sebuah BPHTB yang tidak lolos tetap sebuah tahap yang sudah dijalani.
    selesai: (k) => Boolean(k.bphtb_status),
    ringkas: (k) => [k.bphtb_status === "lolos" ? "Lolos" : k.bphtb_status === "tidak_lolos" ? "Tidak lolos" : null, rupiah(k.bphtb)].filter((v) => v && v !== "-").join(" · "),
    bidang: [
      { key: "bphtb_status", label: "Hasil BPHTB", tipe: "pilih", opsi: [["lolos", "Lolos"], ["tidak_lolos", "Tidak lolos"]] },
      { key: "bphtb", label: "Nominal BPHTB", tipe: "rupiah" },
    ],
    lampiran: [{ slot: "bphtb", label: "Dokumen BPHTB" }],
  },
  {
    kunci: "shm",
    label: "SHM",
    selesai: (k) => Boolean(k.shm),
    ringkas: (k) => [k.shm, k.shm_balik_nama === "sudah" ? "sudah balik nama" : k.shm_balik_nama === "belum" ? "belum balik nama" : null].filter(Boolean).join(" · ") || "-",
    bidang: [
      { key: "shm", label: "Nomor SHM", tipe: "text" },
      { key: "shm_balik_nama", label: "Balik Nama", tipe: "pilih", opsi: [["sudah", "Sudah balik nama"], ["belum", "Belum balik nama"]] },
    ],
    lampiran: [{ slot: "shm", label: "Dokumen SHM" }],
  },
];

/** Peringatan yang selama ini tidak pernah dimunculkan meski datanya ada. */
function peringatan(kpr) {
  const hasil = [];

  if (kpr.bi_checking_status === "tidak_lolos") {
    hasil.push({
      berat: true,
      teks: kpr.tanggal_masuk_bank
        ? "BI-Checking tidak lolos, tetapi berkas sudah dikirim ke bank. Pertimbangkan menarik pengajuan sebelum tercatat sebagai penolakan."
        : "BI-Checking tidak lolos. Jangan kirim berkas ke bank sebelum masalahnya diselesaikan.",
    });
  } else if (kpr.tanggal_booking && !kpr.bi_checking_status) {
    // Saringan yang dilewati adalah saringan yang tidak ada gunanya.
    hasil.push({
      berat: false,
      teks: "Booking sudah tercatat tetapi BI-Checking belum. Saringan awal seharusnya mendahului booking.",
    });
  } else if (kpr.tanggal_masuk_bank && !kpr.tanggal_sp3k_terbit && kpr.bi_checking_status !== "lolos") {
    hasil.push({ berat: false, teks: "Berkas sudah di bank tetapi hasil BI-Checking belum tercatat." });
  }

  const rpc = rasioRpc(kpr);
  if (rpc != null && rpc > BATAS_RPC && !kpr.tanggal_akad) {
    hasil.push({
      berat: rpc > 0.4,
      teks: `Angsuran ${Math.round(rpc * 100)}% dari penghasilan — di atas patokan sepertiga. Berkas dengan rasio ini kerap ditolak dengan alasan RPC tidak cukup.`,
    });
  }

  if (kpr.tanggal_sp3k_expired && !kpr.tanggal_akad) {
    const sisa = selisihHari(kpr.tanggal_sp3k_expired);
    if (sisa !== null && sisa < 0) {
      hasil.push({ berat: true, teks: `SP3K sudah kedaluwarsa ${Math.abs(sisa)} hari lalu dan akad belum terjadi. Perlu perpanjangan.` });
    } else if (sisa !== null && sisa <= 14) {
      hasil.push({ berat: sisa <= 7, teks: `SP3K kedaluwarsa dalam ${sisa} hari. Pastikan akad terjadwal atau ajukan perpanjangan.` });
    }
  }

  if (kpr.tanggal_masuk_bank && !kpr.tanggal_sp3k_terbit) {
    const lama = -selisihHari(kpr.tanggal_masuk_bank);
    if (lama > 60) hasil.push({ berat: true, teks: `Berkas sudah ${lama} hari di bank tanpa SP3K terbit.` });
    else if (lama > 30) hasil.push({ berat: false, teks: `Berkas sudah ${lama} hari di bank. Perlu ditanyakan ke bank.` });
  }

  if (kpr.nominal_total_dp && kpr.dp_terbayar != null) {
    const sisa = Number(kpr.nominal_total_dp) - Number(kpr.dp_terbayar);
    if (sisa > 0) hasil.push({ berat: false, teks: `Sisa DP belum terbayar: ${rupiah(sisa)}.` });
  }

  if (kpr.bphtb_status === "tidak_lolos") {
    hasil.push({ berat: true, teks: "BPHTB tidak lolos — serah terima sertifikat tidak bisa diteruskan sebelum diselesaikan." });
  }

  return hasil;
}

export default function KprStepper({ kpr, customerId, editable, onChange }) {
  const toast = useToast();
  const banks = useBusinessSettings("bank");
  const progresBerkas = useBusinessSettings("progres_berkas");

  const [nilai, setNilai] = useState(kpr || {});
  const [dibuka, setDibuka] = useState(null);
  const [menyimpan, setMenyimpan] = useState(null);
  const [tersimpan, setTersimpan] = useState(null);
  const [prosesBank, setProsesBank] = useState(false);
  const [segarBerkas, setSegarBerkas] = useState(0);

  // Cerminan nilai yang benar-benar ada di database. Membandingkan dengan prop
  // `kpr` tidak cukup: prop itu ikut basi begitu induk memuat ulang karena
  // sebab lain, dan sebuah kolom yang diubah lalu dikembalikan ke nilai
  // semula akan dikira tidak berubah — sehingga nilai antaranya tertinggal.
  const tersimpanRef = React.useRef({ ...(kpr || {}) });

  // Hanya berganti konsumen yang mengatur ulang keadaan.
  React.useEffect(() => {
    setNilai(kpr || {});
    tersimpanRef.current = { ...(kpr || {}) };
    setDibuka(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const indeksAktif = useMemo(() => {
    const belum = TAHAP.findIndex((t) => !t.selesai(nilai));
    return belum === -1 ? TAHAP.length - 1 : belum;
  }, [nilai]);

  const terbuka = dibuka ?? TAHAP[indeksAktif]?.kunci;
  const catatan = peringatan(nilai);

  // Total DP dihitung di layar juga, bukan menunggu jawaban server: angkanya
  // harus berubah pada ketukan yang sama dengan yang mengubah penyusunnya.
  const totalDp = useMemo(() => {
    // `Number(null)` adalah 0, bukan NaN — memeriksa keterisian lewat
    // Number.isFinite() akan menganggap kolom kosong sebagai nol, dan baris
    // lama yang totalnya pernah diketik tangan akan tampil Rp 0 meski
    // ringkasan tahapnya menunjukkan angka sebenarnya.
    const isi = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
    const a = isi(nilai.nominal_dp) ? Number(nilai.nominal_dp) : null;
    const b = isi(nilai.biaya_tambahan_tanah) ? Number(nilai.biaya_tambahan_tanah) : null;
    if (a === null && b === null) return nilai.nominal_total_dp ?? "";
    return (a ?? 0) + (b ?? 0);
  }, [nilai.nominal_dp, nilai.biaya_tambahan_tanah, nilai.nominal_total_dp]);

  /**
   * Simpan per bidang saat fokus meninggalkannya.
   *
   * Tombol "Simpan Progres KPR" tunggal yang lama berarti berpindah konsumen
   * di tengah pengisian membuang seluruh isian tanpa peringatan apa pun.
   */
  async function simpanBidang(key, value) {
    if (!editable || !customerId) return;
    const asal = tersimpanRef.current[key] ?? null;
    const baru = value === "" ? null : value;
    if (String(asal ?? "") === String(baru ?? "")) return;

    setMenyimpan(key);
    const { data, error } = await supabase
      .from("customer_kpr")
      .upsert({ customer_id: customerId, [key]: baru, updated_at: new Date().toISOString() }, { onConflict: "customer_id" })
      .select()
      .maybeSingle();
    setMenyimpan(null);

    if (error) {
      // Nilai dikembalikan ke keadaan tersimpan, supaya layar tidak menampilkan
      // sesuatu yang sebenarnya tidak ada di database.
      setNilai((v) => ({ ...v, [key]: asal }));
      toast.gagal(`Gagal menyimpan: ${error.message}`);
      return;
    }

    // Baris dibaca kembali karena trigger ikut menulis: Total DP dihitung di
    // server, dan tanpa membacanya kembali layar akan menampilkan total lama
    // sampai halaman dimuat ulang.
    const baris = data || { ...tersimpanRef.current, [key]: baru };
    const sebelum = tersimpanRef.current;
    tersimpanRef.current = { ...baris };

    // Hanya kolom yang TIDAK sedang disentuh pengguna yang ikut diperbarui.
    //
    // Penyimpanan berjalan per kolom dan tidak menunggu: seseorang yang
    // mengisi Nominal DP lalu langsung pindah ke Biaya Tanah akan menerima
    // jawaban simpanan pertama di tengah ketikan kedua. Menimpa seluruh baris
    // akan menghapus apa yang baru saja ia tulis — kesalahan yang tampak
    // seperti papan tik yang rusak, bukan seperti bug.
    setNilai((v) => {
      const gabung = { ...v };
      for (const k of Object.keys(baris)) {
        const belumDisentuh = String(v[k] ?? "") === String(sebelum[k] ?? "");
        if (k === key || belumDisentuh) gabung[k] = baris[k];
      }
      return gabung;
    });
    setTersimpan(key);
    setTimeout(() => setTersimpan((k) => (k === key ? null : k)), 1800);
    onChange?.(baris);
  }

  function ubah(key, value) {
    setNilai((v) => ({ ...v, [key]: value }));
  }

  /** BRIEF §Bank: "Setelah Proses Dokumen sudah lengkap Tambahkan pilihan Klik proses bank". */
  async function kirimKeBank() {
    setProsesBank(true);
    const { data, error } = await supabase.rpc("tandai_proses_bank", { p_customer_id: customerId });
    setProsesBank(false);
    if (error) {
      // Pesan RPC sudah berbahasa Indonesia dan menyebut dokumen mana yang
      // kurang, jadi ditampilkan apa adanya.
      toast.gagal(error.message);
      return;
    }
    const baris = { ...nilai, proses_bank_at: data, tanggal_masuk_bank: nilai.tanggal_masuk_bank || new Date().toISOString().slice(0, 10) };
    tersimpanRef.current = { ...tersimpanRef.current, ...baris };
    setNilai(baris);
    toast.sukses("Berkas dinyatakan lengkap dan diproses ke bank.");
    onChange?.(baris);
  }

  function renderBidang(b) {
    const v = nilai[b.key] ?? "";
    const gaya = { ...inputStyle, ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) };

    if (b.tipe === "hitung") {
      return (
        <div
          style={{
            ...inputStyle,
            background: PRIMARY_SOFT,
            color: TEXT_DARK,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{rupiah(totalDp)}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: TEXT_MID }}>otomatis</span>
        </div>
      );
    }

    if (b.tipe === "bi" || b.tipe === "pilih") {
      const opsi =
        b.tipe === "bi"
          ? [["menunggu", "Menunggu hasil"], ["lolos", "Lolos"], ["tidak_lolos", "Tidak lolos"]]
          : b.opsi;
      return (
        <select
          value={v}
          disabled={!editable}
          onChange={(e) => {
            ubah(b.key, e.target.value);
            simpanBidang(b.key, e.target.value);
          }}
          style={gaya}
        >
          <option value="">{b.tipe === "bi" ? "Belum diperiksa" : "— belum ditentukan —"}</option>
          {opsi.map(([nilaiOpsi, label]) => (
            <option key={nilaiOpsi} value={nilaiOpsi}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (b.tipe === "bank" || b.tipe === "progres") {
      const opsi = b.tipe === "bank" ? banks : progresBerkas;
      return (
        <select
          value={v}
          disabled={!editable}
          onChange={(e) => {
            ubah(b.key, e.target.value);
            simpanBidang(b.key, e.target.value);
          }}
          style={gaya}
        >
          <option value="">{b.tipe === "bank" ? "Pilih Bank" : "Pilih Progres"}</option>
          {withCurrentValue(opsi, v).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    if (b.tipe === "rupiah") {
      return (
        <InputRupiah
          value={v}
          disabled={!editable}
          pilihanCepat={editable ? b.cepat : undefined}
          onChange={(n) => ubah(b.key, n)}
          onBlur={(_e, n) => simpanBidang(b.key, n)}
        />
      );
    }

    // BRIEF §Saringan Awal: "Bagian Catatan kalau tidak bisa di kosongkan di
    // strip (-)". Strip hanya muncul saat kolomnya tidak sedang diisi — sebuah
    // "-" yang harus dihapus dulu sebelum mengetik justru menambah pekerjaan.
    if (b.strip && !editable) {
      return <div style={{ ...gaya, background: "#F4F6FA", color: TEXT_MID }}>{atauStrip(v)}</div>;
    }

    return (
      <input
        type={b.tipe}
        value={v}
        disabled={!editable}
        placeholder={b.strip ? "-" : undefined}
        onChange={(e) => ubah(b.key, e.target.value)}
        onBlur={(e) => simpanBidang(b.key, e.target.value)}
        style={gaya}
      />
    );
  }

  return (
    <div>
      {/* Rel tahapan — satu pandangan untuk menjawab "sampai mana". */}
      <div className="kpr-rail" style={{ display: "flex", alignItems: "flex-start", marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {TAHAP.map((t, i) => {
          const selesai = t.selesai(nilai);
          const aktif = i === indeksAktif;
          return (
            <React.Fragment key={t.kunci}>
              {i > 0 && (
                <div
                  aria-hidden="true"
                  style={{ flex: 1, height: 2, background: selesai ? PRIMARY : BORDER, marginTop: 12, minWidth: 12 }}
                />
              )}
              <button
                onClick={() => setDibuka(t.kunci)}
                aria-current={aktif ? "step" : undefined}
                title={t.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    background: selesai ? PRIMARY : aktif ? ACCENT : SURFACE,
                    color: selesai || aktif ? "#fff" : TEXT_MID,
                    border: selesai || aktif ? "none" : `1.5px solid ${BORDER}`,
                  }}
                >
                  {selesai ? <Check size={14} /> : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: aktif ? 700 : 500,
                    color: aktif ? ACCENT_DARK : selesai ? TEXT_DARK : TEXT_MID,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {catatan.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {catatan.map((c, i) => (
            <div
              key={i}
              role={c.berat ? "alert" : undefined}
              style={{
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
                background: c.berat ? "#FBE9E8" : ACCENT_SOFT,
                border: `1px solid ${c.berat ? "#F2D3D1" : "#F6CDB8"}`,
                borderRadius: 12,
                padding: "10px 13px",
                fontSize: 12.5,
                color: c.berat ? NEGATIVE : ACCENT_DARK,
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>{c.teks}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tahap. Yang selesai terlipat jadi satu baris, yang aktif terbuka. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TAHAP.map((t, i) => {
          const selesai = t.selesai(nilai);
          const aktif = i === indeksAktif;
          const buka = terbuka === t.kunci;
          const mendatang = i > indeksAktif;
          const prasyarat = mendatang ? TAHAP[indeksAktif]?.label : null;

          return (
            <div
              key={t.kunci}
              style={{
                border: `1px solid ${buka ? (aktif ? ACCENT : PRIMARY_SOFT) : BORDER}`,
                borderRadius: 14,
                background: mendatang && !buka ? "#FBFCFE" : SURFACE,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setDibuka(buka ? "__tidak_ada__" : t.kunci)}
                aria-expanded={buka}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "12px 15px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: mendatang ? TEXT_MID : TEXT_DARK }}>
                    {t.label}
                  </span>
                  {selesai && <Check size={14} color={POSITIVE} aria-label="selesai" />}
                  {aktif && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "2px 8px", borderRadius: 999 }}>
                      TAHAP AKTIF
                    </span>
                  )}
                  {mendatang && <Lock size={12} color={TEXT_MID} aria-label="belum sampai tahap ini" />}
                </span>

                {!buka && (
                  <span style={{ fontSize: 12, color: TEXT_MID, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "48%" }}>
                    {selesai ? t.ringkas(nilai) : mendatang ? `Menunggu ${prasyarat}` : "Belum diisi"}
                  </span>
                )}

                <ChevronDown
                  size={15}
                  color={TEXT_MID}
                  aria-hidden="true"
                  style={{ flexShrink: 0, transform: buka ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
                />
              </button>

              {buka && (
                <div style={{ padding: "0 15px 15px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="rg-3">
                    {t.bidang.map((b) => (
                      <div key={b.key} style={b.lebar === 2 ? { gridColumn: "span 2" } : undefined}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
                          {b.label}
                          {menyimpan === b.key && <span style={{ fontWeight: 500, color: TEXT_MID }}> · menyimpan…</span>}
                          {tersimpan === b.key && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
                        </label>
                        {renderBidang(b)}
                      </div>
                    ))}
                  </div>

                  {t.catatan && <div style={{ fontSize: 11.5, color: TEXT_MID, lineHeight: 1.5 }}>{t.catatan}</div>}

                  {t.lampiran?.map((l) => (
                    <LampiranTahap
                      key={l.slot}
                      slot={l.slot}
                      customerId={customerId}
                      label={l.label}
                      hint={l.hint}
                      editable={editable}
                    />
                  ))}

                  {t.pembayaran && (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, marginBottom: 7, letterSpacing: "0.02em" }}>
                        KWITANSI &amp; BUKTI TRANSFER
                      </div>
                      <VerifikasiPembayaran
                        customerId={customerId}
                        jenis={t.pembayaran}
                        editable={editable}
                        onChange={() => setSegarBerkas((v) => v + 1)}
                      />
                    </div>
                  )}

                  {t.berkasBank && (
                    <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                      <BerkasBankPanel
                        key={segarBerkas}
                        customerId={customerId}
                        bank={nilai.nama_bank}
                        editable={editable}
                        onChange={() => setSegarBerkas((v) => v + 1)}
                      />

                      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
                        {nilai.proses_bank_at ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: POSITIVE }}>
                            <Check size={14} aria-hidden="true" />
                            Berkas sudah diproses ke bank · {tanggal(nilai.proses_bank_at)}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={kirimKeBank}
                              disabled={!editable || prosesBank}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 7,
                                border: "none",
                                background: editable ? ACCENT : BORDER,
                                color: "#fff",
                                borderRadius: 999,
                                padding: "10px 18px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: editable && !prosesBank ? "pointer" : "default",
                              }}
                            >
                              <Send size={14} aria-hidden="true" />
                              {prosesBank ? "Memproses…" : "Proses Bank"}
                            </button>
                            <span style={{ fontSize: 11.5, color: TEXT_MID, lineHeight: 1.45, maxWidth: 380 }}>
                              Menyatakan berkas lengkap dan diserahkan ke bank. Ditolak selama masih ada dokumen wajib
                              yang belum diunggah.
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dua bidang yang tidak termasuk tahap mana pun. */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
            Alamat KTP
            {tersimpan === "alamat_ktp" && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
          </label>
          <input
            value={nilai.alamat_ktp ?? ""}
            disabled={!editable}
            onChange={(e) => ubah("alamat_ktp", e.target.value)}
            onBlur={(e) => simpanBidang("alamat_ktp", e.target.value)}
            style={{ ...inputStyle, ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
            Kendala atau Catatan
            {tersimpan === "kendala" && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
          </label>
          <textarea
            value={nilai.kendala ?? ""}
            disabled={!editable}
            placeholder="-"
            onChange={(e) => ubah("kendala", e.target.value)}
            onBlur={(e) => simpanBidang("kendala", e.target.value)}
            style={{ ...inputStyle, minHeight: 62, resize: "vertical", fontFamily: "inherit", ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) }}
          />
        </div>
      </div>

      {editable && (
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 12, lineHeight: 1.5 }}>
          Perubahan tersimpan sendiri begitu Anda berpindah dari sebuah kolom — tidak ada tombol simpan yang perlu ditekan.
        </div>
      )}
    </div>
  );
}
