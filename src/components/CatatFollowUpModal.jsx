import React, { useEffect, useState } from "react";
import { Thermometer, Paperclip, FileText, Image as ImageIcon, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { labelTahap, hariIni } from "../lib/format";
import { uploadFile } from "../lib/storage";
import { jenisBerkas } from "../lib/berkas";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, inputStyle } from "./ui";

/**
 * Mencatat follow-up — dan dengan itu, menggerakkan suhu prospek.
 *
 * Modal ini menggantikan "Ubah Tahap". Bedanya bukan tata letak, melainkan
 * siapa yang memutuskan.
 *
 * Sebelumnya Sales memilih sendiri Cold/Warm/Hot dari sederet tombol. BRIEF
 * §Leads memintanya berhenti: "Sistem harus bisa membaca progres interaksi
 * untuk menentukan apakah Leads tersebut masuk kategori (Hot, Cold, atau tetap
 * Warm) — agar mengurangi human error dalam kategorisasi", dan "riwayat
 * komunikasi/log chat harus terintegrasi dengan perubahan status (mis. tertulis
 * 'kurang minat' sistem otomatis mengubah status menjadi 'Cold')".
 *
 * Jadi yang diisi di sini hanya apa yang benar-benar terjadi: hasil percakapan,
 * catatannya, dan kapan orang ini disentuh lagi. Suhunya menyusul sendiri —
 * trigger `lead_activities_apply_temperature` membacanya dari baris yang baru
 * saja ditulis. Pratinjau di bawah menunjukkan arah yang akan diambil sistem,
 * supaya keputusannya tidak terasa seperti kotak hitam.
 *
 * Setiap follow-up kini bertanggal dan berbukti (migrasi 024). Tanggalnya
 * adalah kapan prospek dihubungi — boleh mundur, tidak boleh maju — dan
 * buktinya wajib untuk semua jenis: screenshot chat atau log panggilan, foto
 * survei, foto pertemuan. Catatan, bukti, dan jadwal berikutnya disimpan
 * catat_followup() dalam satu transaksi.
 */

/** Usulan jarak follow-up per hasil — makin panas, makin rapat. */
const JEDA_HASIL = [
  [/siap|deal|survei|booking/i, 2],
  [/tertarik|nego|simulasi/i, 3],
  [/pertimbang|dihubungi ulang/i, 5],
  [/tidak menjawab/i, 2],
  [/tidak berminat|kurang minat|batal/i, 14],
];

/**
 * Cerminan `lead_temperature_from_text()` pada migrasi 017.
 *
 * Hanya untuk pratinjau — yang sungguh menulis status tetap trigger di
 * database. Salinan di sini sengaja dibiarkan sederhana: kalau keduanya
 * berbeda, yang salah adalah tebakan layar, bukan datanya.
 */
function tebakSuhu(teks) {
  const t = String(teks || "");
  if (!t.trim()) return null;
  if (/(tidak|belum|kurang|nggak|ngga|gak)\s*(ber)?minat|tidak\s*tertarik|tidak\s*jadi|batal|cancel|sudah\s*(beli|dapat|punya)|belum\s*ada\s*(dana|biaya|uang)|tunda/i.test(t)) return "cold";
  if (/siap\s*(booking|bayar|akad|dp)|(sudah|mau|akan)\s*survei|survei\s*lokasi|deal|nego|minta\s*(simulasi|berkas|form)|bi\s*-?\s*checking|sangat\s*tertarik/i.test(t)) return "hot";
  if (/tertarik|pertimbang|dihubungi\s*ulang|tanya/i.test(t)) return "warm";
  return null;
}

const WARNA_SUHU = {
  hot: { bg: ACCENT_SOFT, fg: ACCENT_DARK, teks: "Hot Lead" },
  warm: { bg: PRIMARY_SOFT, fg: PRIMARY, teks: "Warm Lead" },
  cold: { bg: "#EEF1F6", fg: "#516079", teks: "Cold Lead" },
};

/**
 * Jenis follow-up dan bukti yang diminta masing-masing.
 *
 * "Survei Lokasi" dieja persis seperti yang dicocokkan catat_followup(): dari
 * situlah ia tahu fotonya masuk lampiran survei Saringan Awal.
 */
export const JENIS_FOLLOWUP = [
  { nilai: "WhatsApp", bukti: "Screenshot percakapan WhatsApp" },
  { nilai: "Telepon", bukti: "Screenshot log panggilan" },
  { nilai: "Survei Lokasi", bukti: "Foto di lokasi bersama calon pembeli" },
  { nilai: "Kunjungan Kantor / Show Unit", bukti: "Foto pertemuan di kantor pemasaran atau unit contoh" },
  { nilai: "Meeting / Kunjungan Rumah", bukti: "Foto pertemuan" },
];

const SURVEI = "Survei Lokasi";

/** Tanggal lokal perangkat, bukan UTC — lihat hariIni(). */
function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CatatFollowUpModal({ lead, open, onClose, onSelesai, aktivitasAwal = "WhatsApp" }) {
  const toast = useToast();
  const hasilOptions = useBusinessSettings("hasil_followup");
  const kategoriOptions = useBusinessSettings("followup_category");

  const [aktivitas, setAktivitas] = useState(aktivitasAwal);
  const [tanggalFu, setTanggalFu] = useState(hariIni());
  const [hasil, setHasil] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bukti, setBukti] = useState([]);
  const [rencana, setRencana] = useState("");
  const [kategori, setKategori] = useState("");
  const [tanggalRencana, setTanggalRencana] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    setAktivitas(aktivitasAwal);
    setTanggalFu(hariIni());
    setHasil("");
    setCatatan("");
    setBukti([]);
    setRencana(lead.rencana_selanjutnya || "");
    setKategori(lead.kategori_rencana || "");
    setTanggalRencana(tanggalPlus(3));
    setGalat("");
    setKirim(false);
  }, [open, lead, aktivitasAwal]);

  // Hasil yang dipilih ikut menggeser usulan tanggalnya: prospek yang siap
  // booking tidak boleh menunggu selama prospek yang menolak.
  function pilihHasil(nilai) {
    setHasil(nilai);
    const cocok = JEDA_HASIL.find(([pola]) => pola.test(nilai));
    setTanggalRencana(tanggalPlus(cocok ? cocok[1] : 3));
  }

  function tambahBukti(daftar) {
    const baru = Array.from(daftar || []);
    if (baru.length) setBukti((b) => [...b, ...baru]);
  }

  const jenis = JENIS_FOLLOWUP.find((j) => j.nilai === aktivitas) || JENIS_FOLLOWUP[0];
  const suhu = tebakSuhu([hasil, catatan].filter(Boolean).join(" "));
  const w = suhu ? WARNA_SUHU[suhu] : null;

  async function simpan() {
    if (!tanggalFu) {
      setGalat("Isi tanggal follow-up — kapan prospek ini dihubungi.");
      return;
    }
    if (tanggalFu > hariIni()) {
      setGalat("Tanggal follow-up tidak boleh melewati hari ini.");
      return;
    }
    if (!hasil && !catatan.trim()) {
      setGalat("Isi hasil follow-up atau catatannya — itulah yang dibaca sistem untuk menentukan status prospek.");
      return;
    }
    if (bukti.length === 0) {
      setGalat(`Lampirkan bukti follow-up: ${jenis.bukti.toLowerCase()}.`);
      return;
    }
    if (!tanggalRencana) {
      setGalat("Tentukan kapan prospek ini akan dihubungi lagi.");
      return;
    }

    setKirim(true);
    setGalat("");

    // Berkas lebih dulu, karena catat_followup() hanya menerima path yang
    // sudah ada. Yang gagal di sini belum menulis apa pun ke database.
    const slot = aktivitas === SURVEI ? "survei" : "followup";
    const unggahan = await Promise.all(bukti.map((f) => uploadFile("berkas-lampiran", `${lead.id}/${slot}`, f)));
    const gagal = unggahan.findIndex((u) => u.error || !u.path);
    if (gagal >= 0) {
      setKirim(false);
      setGalat(`Bukti "${bukti[gagal].name}" gagal diunggah: ${unggahan[gagal].error?.message || "coba lagi."}`);
      return;
    }

    const { error } = await supabase.rpc("catat_followup", {
      p_lead_id: lead.id,
      p_tanggal: tanggalFu,
      p_aktivitas: aktivitas,
      p_hasil: hasil || null,
      p_catatan: catatan.trim() || null,
      p_lampiran: unggahan.map((u, i) => ({ path: u.path, nama: bukti[i].name })),
      p_tanggal_rencana: tanggalRencana,
      p_rencana: rencana.trim() || null,
      p_kategori: kategori || null,
    });

    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }

    kabarkanRiwayat({ leadId: lead.id });
    toast.sukses(
      `Follow-up ${lead.name} tercatat — dihubungi lagi ${new Date(`${tanggalRencana}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}.`
    );
    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="fu-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="fu-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Catat Follow Up — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Status sekarang <b style={{ color: TEXT_DARK }}>{labelTahap(lead.status)}</b>. Status prospek ditentukan sistem
          dari catatan ini — tidak ada yang perlu dipilih sendiri.
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelGaya}>Jenis Follow Up</span>
          <div role="group" aria-label="Jenis follow up" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {JENIS_FOLLOWUP.map((j) => {
              const aktif = aktivitas === j.nilai;
              return (
                <button
                  key={j.nilai}
                  type="button"
                  onClick={() => setAktivitas(j.nilai)}
                  aria-pressed={aktif}
                  style={{
                    padding: "7px 13px",
                    borderRadius: 999,
                    border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                    background: aktif ? PRIMARY : SURFACE,
                    color: aktif ? "#fff" : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: aktif ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {j.nilai}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="fu-tgl-fu" style={labelGaya}>
              Tanggal Follow Up
            </label>
            <input
              id="fu-tgl-fu"
              type="date"
              value={tanggalFu}
              max={hariIni()}
              onChange={(e) => setTanggalFu(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="fu-hasil" style={labelGaya}>
              Hasil Follow Up
            </label>
            <select id="fu-hasil" value={hasil} onChange={(e) => pilihHasil(e.target.value)} style={inputStyle}>
              <option value="">— pilih —</option>
              {withCurrentValue(hasilOptions, hasil).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="fu-catatan" style={labelGaya}>
            Catatan Komunikasi
          </label>
          <textarea
            id="fu-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. Sudah survei, minta simulasi angsuran BTN 15 tahun"
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {/* Bukti wajib untuk setiap jenis. Berkasnya baru diunggah saat
            Simpan, supaya membatalkan formulir tidak meninggalkan berkas. */}
        <div
          style={{
            border: `1px ${bukti.length ? "solid" : "dashed"} ${bukti.length ? BORDER : "#C7D3EA"}`,
            borderRadius: 12,
            padding: "11px 13px",
            marginBottom: 14,
            background: bukti.length ? SURFACE : "#FBFCFE",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Paperclip size={13} color={TEXT_MID} aria-hidden="true" />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID }}>
              Bukti Follow Up<span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>
            </span>
            <span style={{ fontSize: 11, color: TEXT_MID }}>{bukti.length ? `${bukti.length} berkas` : "belum ada"}</span>
            <label
              style={{
                marginLeft: "auto",
                border: `1px solid ${BORDER}`,
                background: "#fff",
                color: TEXT_DARK,
                borderRadius: 9,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: kirim ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + Pilih berkas
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                disabled={kirim}
                onChange={(e) => {
                  tambahBukti(e.target.files);
                  // Memilih berkas yang sama dua kali berturut-turut tidak
                  // memicu onChange kalau nilainya tidak dikosongkan dulu.
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 6, lineHeight: 1.45 }}>
            {jenis.bukti}.
            {aktivitas === SURVEI && " Tanggal dan foto survei ini juga mengisi Saringan Awal, lalu ikut ke berkas KPR saat booking."}
          </div>
          {bukti.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 9 }}>
              {bukti.map((f, i) => {
                const Ikon = jenisBerkas(f.name) === "gambar" ? ImageIcon : FileText;
                return (
                  <div key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{ width: 22, height: 22, borderRadius: 7, background: PRIMARY_SOFT, color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <Ikon size={11} aria-hidden="true" />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBukti((b) => b.filter((_, j) => j !== i))}
                      disabled={kirim}
                      aria-label={`Lepas ${f.name}`}
                      style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 2, lineHeight: 0 }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pratinjau keputusan sistem. Otomatisasi yang tidak menjelaskan
            dirinya akan dilawan oleh penggunanya. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: w ? w.bg : "#F7F9FC",
            borderRadius: 12,
            padding: "10px 13px",
            marginBottom: 16,
            fontSize: 12.5,
            color: w ? w.fg : TEXT_MID,
            lineHeight: 1.5,
          }}
        >
          <Thermometer size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>
            {w ? (
              <>
                Sistem akan menandai prospek ini <b>{w.teks}</b> berdasarkan catatan di atas.
              </>
            ) : (
              "Status ditentukan setelah catatan tersimpan — dari hasil, kata-katanya, jumlah follow-up, dan jarak sejak kontak terakhir."
            )}
          </span>
        </div>

        <div style={{ background: PRIMARY_SOFT, borderRadius: 13, padding: "14px 15px", marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: PRIMARY, marginBottom: 10, letterSpacing: "0.03em" }}>LANGKAH BERIKUTNYA</div>
          <div className="rg-2" style={{ marginBottom: 10 }}>
            <div>
              <label htmlFor="fu-tanggal" style={labelGaya}>
                Dihubungi lagi pada
              </label>
              <input id="fu-tanggal" type="date" value={tanggalRencana} onChange={(e) => setTanggalRencana(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="fu-kategori" style={labelGaya}>
                Kategori
              </label>
              <select id="fu-kategori" value={kategori} onChange={(e) => setKategori(e.target.value)} style={inputStyle}>
                <option value="">— pilih —</option>
                {withCurrentValue(kategoriOptions, kategori).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="fu-rencana" style={labelGaya}>
              Yang akan dilakukan
            </label>
            <input
              id="fu-rencana"
              value={rencana}
              onChange={(e) => setRencana(e.target.value)}
              placeholder="mis. Kirim simulasi angsuran, atur jadwal survei"
              style={inputStyle}
            />
          </div>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 9, lineHeight: 1.45 }}>
            Jadwal ini yang memunculkan prospek di halaman Follow Up dan di lonceng.
          </div>
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
            {kirim ? "Menyimpan…" : "Simpan Follow Up"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
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
