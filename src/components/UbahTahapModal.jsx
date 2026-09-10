import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { labelTahap } from "../lib/format";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE, inputStyle } from "./ui";

/**
 * Mengubah tahap prospek sekaligus menjadwalkan langkah berikutnya.
 *
 * Ini perubahan yang paling menentukan dari seluruh rangkaian ini.
 *
 * Sebelumnya tahap diubah lewat <select> telanjang di dalam sel tabel: satu
 * klik, tidak ada catatan, tidak ada alasan, dan yang terpenting — tidak ada
 * kewajiban menentukan kapan prospek ini disentuh lagi. Akibatnya halaman
 * Reminder nyaris selalu kosong, bukan karena tidak ada pekerjaan, melainkan
 * karena tidak ada yang pernah mengisinya.
 *
 * Sebuah tahap yang maju tanpa langkah berikutnya adalah prospek yang sedang
 * dalam perjalanan menjadi dingin.
 */

const TAHAP_MANUAL = ["leads", "cold", "warm", "hot"];

/** Usulan jarak follow-up per tahap — makin panas, makin rapat. */
const JEDA_HARI = { leads: 3, cold: 14, warm: 3, hot: 2, cancel: null };

function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return d.toISOString().slice(0, 10);
}

export default function UbahTahapModal({ lead, open, onClose, onSelesai }) {
  const { profile } = useAuth();
  const toast = useToast();
  const hasilOptions = useBusinessSettings("hasil_followup");
  const kategoriOptions = useBusinessSettings("followup_category");

  const [tahap, setTahap] = useState("");
  const [hasil, setHasil] = useState("");
  const [catatan, setCatatan] = useState("");
  const [rencana, setRencana] = useState("");
  const [kategori, setKategori] = useState("");
  const [tanggalRencana, setTanggalRencana] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    const awal = TAHAP_MANUAL.includes(lead.status) ? lead.status : "leads";
    setTahap(awal);
    setHasil("");
    setCatatan("");
    setRencana(lead.rencana_selanjutnya || "");
    setKategori(lead.kategori_rencana || "");
    setTanggalRencana(tanggalPlus(JEDA_HARI[awal] ?? 3));
    setGalat("");
    setKirim(false);
  }, [open, lead]);

  // Mengubah tahap menggeser usulan tanggalnya juga: prospek panas tidak boleh
  // menunggu selama prospek dingin.
  function pilihTahap(nilai) {
    setTahap(nilai);
    setTanggalRencana(nilai === "cancel" ? "" : tanggalPlus(JEDA_HARI[nilai] ?? 3));
  }

  const batal = tahap === "cancel";
  const wajibJadwal = !batal;

  async function simpan() {
    if (wajibJadwal && !tanggalRencana) {
      setGalat("Tentukan kapan prospek ini akan dihubungi lagi.");
      return;
    }

    setKirim(true);
    setGalat("");

    const { error: errLead } = await supabase
      .from("leads")
      .update({
        status: tahap,
        tanggal_rencana: tanggalRencana || null,
        rencana_selanjutnya: rencana.trim() || null,
        kategori_rencana: kategori || null,
      })
      .eq("id", lead.id);

    if (errLead) {
      setKirim(false);
      setGalat(errLead.message);
      return;
    }

    // Catatan menyusul terpisah. Kalau ia gagal, perpindahan tahapnya tetap
    // sah — dan kegagalannya disampaikan, bukan ditelan diam-diam.
    const { error: errCatatan } = await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      actor_id: profile?.id || null,
      activity: `Tahap → ${labelTahap(tahap)}`,
      hasil: hasil || null,
      note: [catatan.trim(), rencana.trim() ? `Rencana: ${rencana.trim()}` : null].filter(Boolean).join("\n") || null,
    });

    setKirim(false);

    if (errCatatan) {
      toast.gagal(`Tahap tersimpan, tetapi catatannya gagal: ${errCatatan.message}`);
    } else {
      toast.sukses(
        batal
          ? `${lead.name} ditandai batal.`
          : `${lead.name} kini ${labelTahap(tahap)} — follow-up ${new Date(`${tanggalRencana}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}.`
      );
    }

    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="tahap-judul" onClose={() => !kirim && onClose?.()} width={480}>
      <>
        <div id="tahap-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Ubah Tahap — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Sekarang <b style={{ color: TEXT_DARK }}>{labelTahap(lead.status)}</b>. Setiap perpindahan tahap dicatat ke riwayat.
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelGaya}>Tahap Baru</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...TAHAP_MANUAL, "cancel"].map((t) => {
              const aktif = tahap === t;
              const merah = t === "cancel";
              return (
                <button
                  key={t}
                  onClick={() => pilihTahap(t)}
                  aria-pressed={aktif}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${aktif ? (merah ? NEGATIVE : PRIMARY) : BORDER}`,
                    background: aktif ? (merah ? NEGATIVE : PRIMARY) : SURFACE,
                    color: aktif ? "#fff" : merah ? NEGATIVE : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: aktif ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {labelTahap(t)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="ut-hasil" style={labelGaya}>
            Hasil Follow Up
          </label>
          <select id="ut-hasil" value={hasil} onChange={(e) => setHasil(e.target.value)} style={inputStyle}>
            <option value="">— pilih —</option>
            {withCurrentValue(hasilOptions, hasil).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="ut-catatan" style={labelGaya}>
            Catatan
          </label>
          <textarea
            id="ut-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder={batal ? "Alasan pembatalan — berguna untuk analisis kehilangan prospek" : "mis. Sudah survei, minta simulasi angsuran BTN 15 tahun"}
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {wajibJadwal && (
          <div style={{ background: PRIMARY_SOFT, borderRadius: 13, padding: "14px 15px", marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: PRIMARY, marginBottom: 10, letterSpacing: "0.03em" }}>LANGKAH BERIKUTNYA</div>
            <div className="rg-2" style={{ marginBottom: 10 }}>
              <div>
                <label htmlFor="ut-tanggal" style={labelGaya}>
                  Dihubungi lagi pada
                </label>
                <input
                  id="ut-tanggal"
                  type="date"
                  value={tanggalRencana}
                  onChange={(e) => setTanggalRencana(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="ut-kategori" style={labelGaya}>
                  Kategori
                </label>
                <select id="ut-kategori" value={kategori} onChange={(e) => setKategori(e.target.value)} style={inputStyle}>
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
              <label htmlFor="ut-rencana" style={labelGaya}>
                Yang akan dilakukan
              </label>
              <input
                id="ut-rencana"
                value={rencana}
                onChange={(e) => setRencana(e.target.value)}
                placeholder="mis. Kirim simulasi angsuran, atur jadwal survei"
                style={inputStyle}
              />
            </div>
            <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 9, lineHeight: 1.45 }}>
              Jadwal ini yang memunculkan prospek di halaman Reminder dan di lonceng.
            </div>
          </div>
        )}

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : "Simpan"}
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
