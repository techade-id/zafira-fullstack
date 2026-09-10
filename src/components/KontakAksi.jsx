import React, { useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { useBusinessSettingsMap } from "../lib/useBusinessSettings";
import { telepon, nomorWa } from "../lib/format";
import { templateWa } from "../lib/waTemplates";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, POSITIVE, PRIMARY, inputStyle } from "./ui";

/**
 * Nomor telepon yang bisa ditindaklanjuti.
 *
 * Dua hal sekaligus, dan yang kedua justru yang penting:
 *
 *   1. Membuka WhatsApp dengan pesan pembuka sesuai tahap prospek.
 *   2. Menawarkan pencatatan segera setelahnya.
 *
 * Yang kedua adalah penerapan prinsip "mencatat sebagai efek samping": riwayat
 * komunikasi terisi karena seseorang benar-benar menghubungi konsumen, bukan
 * karena ia ingat mengisi formulir terpisah setelahnya. Timeline yang bergantung
 * pada kedisiplinan mengisi selalu berlubang.
 */
export default function KontakAksi({
  phone,
  nama,
  tahap,
  unit,
  leadId,
  customerId,
  onCatat,
  ringkas = false,
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [tanya, setTanya] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [hasil, setHasil] = useState("Terhubung");
  const [simpan, setSimpan] = useState(false);

  const templates = useBusinessSettingsMap("wa_template");
  const wa = nomorWa(phone);
  const bolehCatat = canWrite(profile, "followup") && (leadId || customerId);

  function bukaWa() {
    const pesan = templateWa(tahap, { nama, agen: profile?.full_name, unit, dariPengaturan: templates });
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`, "_blank", "noopener");
    if (bolehCatat) setTanya(true);
  }

  async function simpanCatatan() {
    setSimpan(true);
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: leadId || null,
      customer_id: customerId || null,
      actor_id: profile?.id || null,
      activity: "WhatsApp",
      hasil,
      note: catatan.trim() || null,
    });
    setSimpan(false);

    if (error) {
      toast.gagal(`Catatan gagal disimpan: ${error.message}`);
      return;
    }
    setTanya(false);
    setCatatan("");
    toast.sukses("Percakapan tercatat di riwayat.");
    onCatat?.();
  }

  if (!phone) return <span style={{ color: TEXT_MID }}>-</span>;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      {!ringkas && <span>{telepon(phone)}</span>}

      {wa && (
        <button
          onClick={bukaWa}
          title={`Kirim WhatsApp ke ${nama || telepon(phone)}`}
          aria-label={`Kirim WhatsApp ke ${nama || telepon(phone)}`}
          style={gayaIkon(POSITIVE)}
        >
          <MessageCircle size={14} />
        </button>
      )}

      <a
        href={`tel:${String(phone).replace(/[^\d+]/g, "")}`}
        title={`Telepon ${nama || telepon(phone)}`}
        aria-label={`Telepon ${nama || telepon(phone)}`}
        style={{ ...gayaIkon(PRIMARY), textDecoration: "none" }}
      >
        <Phone size={14} />
      </a>

      <Modal open={tanya} labelledBy="wa-catat-judul" onClose={() => !simpan && setTanya(false)} width={420}>
        <>
          <div id="wa-catat-judul" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            Catat percakapan ini?
          </div>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
            Satu baris singkat sudah cukup. Seluruh teksnya nanti dapat ditemukan lewat pencarian di header.
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="wa-hasil" style={labelGaya}>
              Hasil
            </label>
            <select id="wa-hasil" value={hasil} onChange={(e) => setHasil(e.target.value)} style={inputStyle}>
              {["Terhubung", "Tidak dijawab", "Minta dihubungi lagi", "Tertarik", "Belum tertarik"].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="wa-catatan" style={labelGaya}>
              Catatan
            </label>
            <textarea
              id="wa-catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="mis. Minta dikirimi simulasi angsuran BTN, akan kabari akhir pekan"
              style={{ ...inputStyle, minHeight: 76, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
            <button onClick={() => setTanya(false)} disabled={simpan} style={gayaSekunder}>
              Lewati
            </button>
            <PrimaryButton onClick={simpanCatatan} disabled={simpan}>
              {simpan ? "Menyimpan…" : "Simpan Catatan"}
            </PrimaryButton>
          </div>
        </>
      </Modal>
    </span>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

function gayaIkon(warna) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: warna,
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  };
}

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
