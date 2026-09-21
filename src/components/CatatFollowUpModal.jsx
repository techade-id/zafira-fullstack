import React, { useEffect, useState } from "react";
import { Thermometer } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { labelTahap } from "../lib/format";
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

function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return d.toISOString().slice(0, 10);
}

export default function CatatFollowUpModal({ lead, open, onClose, onSelesai }) {
  const { profile } = useAuth();
  const toast = useToast();
  const hasilOptions = useBusinessSettings("hasil_followup");
  const kategoriOptions = useBusinessSettings("followup_category");

  const [aktivitas, setAktivitas] = useState("WhatsApp");
  const [hasil, setHasil] = useState("");
  const [catatan, setCatatan] = useState("");
  const [rencana, setRencana] = useState("");
  const [kategori, setKategori] = useState("");
  const [tanggalRencana, setTanggalRencana] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    setAktivitas("WhatsApp");
    setHasil("");
    setCatatan("");
    setRencana(lead.rencana_selanjutnya || "");
    setKategori(lead.kategori_rencana || "");
    setTanggalRencana(tanggalPlus(3));
    setGalat("");
    setKirim(false);
  }, [open, lead]);

  // Hasil yang dipilih ikut menggeser usulan tanggalnya: prospek yang siap
  // booking tidak boleh menunggu selama prospek yang menolak.
  function pilihHasil(nilai) {
    setHasil(nilai);
    const cocok = JEDA_HASIL.find(([pola]) => pola.test(nilai));
    setTanggalRencana(tanggalPlus(cocok ? cocok[1] : 3));
  }

  const suhu = tebakSuhu([hasil, catatan].filter(Boolean).join(" "));
  const w = suhu ? WARNA_SUHU[suhu] : null;

  async function simpan() {
    if (!hasil && !catatan.trim()) {
      setGalat("Isi hasil follow-up atau catatannya — itulah yang dibaca sistem untuk menentukan suhu prospek.");
      return;
    }
    if (!tanggalRencana) {
      setGalat("Tentukan kapan prospek ini akan dihubungi lagi.");
      return;
    }

    setKirim(true);
    setGalat("");

    // Catatan lebih dulu: inilah yang memicu trigger penentu suhu. Kalau ia
    // gagal, jadwal berikutnya tidak boleh ikut tersimpan — sebuah jadwal
    // tanpa alasan adalah persis keadaan yang membuat Reminder dulu kosong.
    const { error: errCatatan } = await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      actor_id: profile?.id || null,
      activity: aktivitas.trim() || "Follow up",
      hasil: hasil || null,
      note: [catatan.trim(), rencana.trim() ? `Rencana: ${rencana.trim()}` : null].filter(Boolean).join("\n") || null,
    });

    if (errCatatan) {
      setKirim(false);
      setGalat(errCatatan.message);
      return;
    }

    const { error: errLead } = await supabase
      .from("leads")
      .update({
        tanggal_rencana: tanggalRencana || null,
        rencana_selanjutnya: rencana.trim() || null,
        kategori_rencana: kategori || null,
      })
      .eq("id", lead.id);

    setKirim(false);

    if (errLead) {
      toast.gagal(`Catatan tersimpan, tetapi jadwalnya gagal: ${errLead.message}`);
    } else {
      toast.sukses(
        `Follow-up ${lead.name} tercatat — dihubungi lagi ${new Date(`${tanggalRencana}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}.`
      );
    }

    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="fu-judul" onClose={() => !kirim && onClose?.()} width={480}>
      <>
        <div id="fu-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Catat Follow Up — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Sekarang <b style={{ color: TEXT_DARK }}>{labelTahap(lead.status)}</b>. Suhu prospek ditentukan sistem dari
          catatan ini — tidak ada tahap yang perlu dipilih sendiri.
        </div>

        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="fu-aktivitas" style={labelGaya}>
              Aktivitas
            </label>
            <input
              id="fu-aktivitas"
              value={aktivitas}
              onChange={(e) => setAktivitas(e.target.value)}
              placeholder="WhatsApp / Telepon / Survei"
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
              "Suhu ditentukan setelah catatan tersimpan — dari hasil, kata-katanya, jumlah follow-up, dan jarak sejak kontak terakhir."
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
