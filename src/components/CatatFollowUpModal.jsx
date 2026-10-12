import React, { useEffect, useState } from "react";
import { Thermometer, Paperclip, FileText, Image as ImageIcon, X, MapPin, Ban } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { labelTahap, hariIni, tanggal } from "../lib/format";
import { uploadFile } from "../lib/storage";
import { jenisBerkas } from "../lib/berkas";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, inputStyle } from "./ui";

/**
 * Chat Follow Up — mencatat follow-up, dan dengan itu menggerakkan suhu
 * prospek.
 *
 * Satu jendela untuk dua hal yang dulu terpisah: riwayat komunikasi (di atas,
 * seperti utas percakapan) dan catatan baru (di bawahnya). Klien meminta
 * "Riwayat Komunikasi" diganti "Chat Follow Up" justru karena keduanya memang
 * satu pekerjaan — orang membaca percakapan terakhir sebelum menulis yang
 * berikutnya.
 *
 * Jenisnya empat, sesuai alur klien: Chat dan Telepon dicatat di sini;
 * Survei dan Cancel adalah langkah tersendiri — survei punya tanggal, foto,
 * dan isian Saringan Awal, pembatalan wajib beralasan — sehingga memilihnya
 * membuka jendelanya masing-masing (onPindah).
 *
 * Yang diisi hanya apa yang benar-benar terjadi: hasil (opsional), catatan,
 * dan kapan orang ini disentuh lagi. Suhunya menyusul sendiri — trigger
 * `lead_activities_apply_temperature` membacanya dari baris yang baru saja
 * ditulis. Pratinjau di bawah menunjukkan arah yang akan diambil sistem.
 *
 * Setiap follow-up bertanggal dan berbukti (migrasi 024). Tanggalnya adalah
 * kapan prospek dihubungi — boleh mundur bila lupa dicatat di hari H, tidak
 * boleh maju — dan buktinya screenshot chat atau log panggilan.
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
 * Jenis follow-up yang dicatat lewat jendela ini, dan bukti yang diminta
 * masing-masing. Catatan lama berjenis "WhatsApp", "Kunjungan Kantor", dan
 * sebagainya tetap tampil apa adanya di riwayat.
 */
export const JENIS_FOLLOWUP = [
  { nilai: "Chat", bukti: "Screenshot percakapan chat (WhatsApp/DM)" },
  { nilai: "Telepon", bukti: "Screenshot log panggilan" },
];

/** Langkah yang punya jendelanya sendiri — dibuka lewat onPindah. */
const LANGKAH_LAIN = [
  { kunci: "survei", label: "Survei", ikon: MapPin },
  { kunci: "batal", label: "Cancel", ikon: Ban },
];

/** Tanggal lokal perangkat, bukan UTC — lihat hariIni(). */
function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * @param onPindah(langkah) dipanggil saat Survei atau Cancel dipilih —
 *   'survei' | 'batal'. Tanpanya kedua pilihan itu tidak ditawarkan.
 */
export default function CatatFollowUpModal({ lead, open, onClose, onSelesai, aktivitasAwal = "Chat", onPindah }) {
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
    setAktivitas(JENIS_FOLLOWUP.some((j) => j.nilai === aktivitasAwal) ? aktivitasAwal : JENIS_FOLLOWUP[0].nilai);
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
    const unggahan = await Promise.all(bukti.map((f) => uploadFile("berkas-lampiran", `${lead.id}/followup`, f)));
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
          Chat Follow Up — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>
          Status sekarang <b style={{ color: TEXT_DARK }}>{labelTahap(lead.status)}</b>. Status prospek ditentukan sistem
          dari catatan ini — tidak ada yang perlu dipilih sendiri.
        </div>

        <RiwayatChat leadId={lead.id} open={open} />

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
            {onPindah &&
              LANGKAH_LAIN.map((l) => (
                <button
                  key={l.kunci}
                  type="button"
                  onClick={() => onPindah(l.kunci)}
                  disabled={kirim}
                  title={l.kunci === "survei" ? "Buka formulir Survei — tanggal, foto, dan catatan survei" : "Batalkan prospek beserta alasannya"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "7px 13px",
                    borderRadius: 999,
                    border: `1px dashed ${l.kunci === "batal" ? "#F2D3D1" : BORDER}`,
                    background: SURFACE,
                    color: l.kunci === "batal" ? NEGATIVE : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <l.ikon size={12} aria-hidden="true" />
                  {l.label}
                </button>
              ))}
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
              Hasil Follow Up <span style={{ fontWeight: 400 }}>(opsional)</span>
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
            Isi Chat / Catatan Komunikasi
          </label>
          <textarea
            id="fu-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. Minta simulasi angsuran BTN 15 tahun, mau survei Sabtu"
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {/* Bukti wajib untuk setiap jenis. Berkasnya baru diunggah saat
            Simpan, supaya membatalkan formulir tidak meninggalkan berkas. */}
        <PemilihBukti
          bukti={bukti}
          onUbah={setBukti}
          disabled={kirim}
          wajib
          petunjuk={`${jenis.bukti}.`}
        />

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
            {kirim ? "Menyimpan…" : "Simpan Chat Follow Up"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

/** Catatan sistem yang tidak perlu tampil di utas percakapan. */
const BUKAN_PERCAKAPAN = ["Prospek dialihkan", "Follow-up dijadwal ulang"];

/**
 * Riwayat follow-up prospek sebagai utas: terlama di atas, terbaru di bawah,
 * tepat di atas tempat menulis catatan berikutnya. Hanya baca — mengubah atau
 * menghapus catatan diajukan dari kartu Riwayat di panel prospek.
 */
export function RiwayatChat({ leadId, open, tinggi = 190 }) {
  const [baris, setBaris] = useState(null);
  const kotak = React.useRef(null);

  useEffect(() => {
    if (!open || !leadId) return undefined;
    let hidup = true;
    setBaris(null);
    supabase
      .from("lead_activities")
      .select("id, activity, hasil, note, tanggal_followup, created_at, profiles(full_name)")
      .eq("lead_id", leadId)
      .order("tanggal_followup", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => hidup && setBaris((data || []).filter((r) => !BUKAN_PERCAKAPAN.includes(r.activity)).reverse()));
    return () => {
      hidup = false;
    };
  }, [leadId, open]);

  // Seperti aplikasi chat: yang terbaru langsung terlihat.
  useEffect(() => {
    if (kotak.current) kotak.current.scrollTop = kotak.current.scrollHeight;
  }, [baris]);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.03em", marginBottom: 7 }}>
        RIWAYAT CHAT{baris && baris.length > 0 ? ` · ${baris.length}` : ""}
      </div>
      <div
        ref={kotak}
        style={{ maxHeight: tinggi, overflowY: "auto", background: "#F7F9FC", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "8px 10px" }}
      >
        {baris === null ? (
          <div style={{ fontSize: 12, color: TEXT_MID, padding: "6px 2px" }}>Memuat riwayat…</div>
        ) : baris.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_MID, padding: "6px 2px" }}>Belum ada percakapan — ini follow-up pertama.</div>
        ) : (
          baris.map((r) => (
            <div key={r.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "7px 10px", margin: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_DARK }}>{r.activity}</span>
                {r.hasil && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "1px 8px", borderRadius: 999 }}>{r.hasil}</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: TEXT_MID, whiteSpace: "nowrap" }}>
                  {tanggal(r.tanggal_followup || r.created_at)}
                  {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}
                </span>
              </div>
              {r.note && <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{r.note}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Memilih berkas bukti tanpa langsung mengunggahnya — dipakai Catat Follow Up
 * dan Ajukan Perubahan Catatan. Berkas baru dikirim saat formulirnya
 * disimpan, supaya formulir yang dibatalkan tidak meninggalkan berkas.
 *
 * @param bukti  daftar File yang sudah dipilih
 * @param onUbah dipanggil dengan daftar baru
 */
export function PemilihBukti({ bukti, onUbah, disabled, wajib = false, judul = "Bukti Follow Up", petunjuk }) {
  const kosong = bukti.length === 0;
  return (
    <div
      style={{
        border: `1px ${!kosong || !wajib ? "solid" : "dashed"} ${!kosong || !wajib ? BORDER : "#C7D3EA"}`,
        borderRadius: 12,
        padding: "11px 13px",
        marginBottom: 14,
        background: !kosong || !wajib ? SURFACE : "#FBFCFE",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Paperclip size={13} color={TEXT_MID} aria-hidden="true" />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID }}>
          {judul}
          {wajib && <span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MID }}>{kosong ? "belum ada" : `${bukti.length} berkas`}</span>
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
            cursor: disabled ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Pilih berkas
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={disabled}
            onChange={(e) => {
              const baru = Array.from(e.target.files || []);
              if (baru.length) onUbah([...bukti, ...baru]);
              // Memilih berkas yang sama dua kali berturut-turut tidak
              // memicu onChange kalau nilainya tidak dikosongkan dulu.
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {petunjuk && <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 6, lineHeight: 1.45 }}>{petunjuk}</div>}
      {!kosong && (
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
                  onClick={() => onUbah(bukti.filter((_, j) => j !== i))}
                  disabled={disabled}
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
