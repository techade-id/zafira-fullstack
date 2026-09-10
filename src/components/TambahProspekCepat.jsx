import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { useBusinessSettings } from "../lib/useBusinessSettings";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY_SOFT, PRIMARY, NEGATIVE, inputStyle } from "./ui";

/**
 * Menangkap prospek dalam hitungan detik, dari halaman mana pun.
 *
 * PRD §4.1 sudah membuat formulir intaknya minimal — tiga bidang. Yang tersisa
 * adalah jaraknya: seorang Sales di pameran atau OTS harus membuka menu,
 * berpindah ke halaman Prospek, menekan "+ Prospek Baru", baru mengisi. Dengan
 * calon pembeli berdiri di depannya, tiga langkah itu sudah terlalu banyak —
 * dan prospek yang dicatat di kertas biasanya berhenti di kertas.
 *
 * Tombol ini duduk di header, jadi selalu satu ketukan jauhnya.
 */
export default function TambahProspekCepat() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const organik = useBusinessSettings("organik_kategori");

  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [telepon, setTelepon] = useState("");
  const [sumber, setSumber] = useState("organik");
  const [kategori, setKategori] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");
  const namaRef = useRef(null);

  const boleh = canWrite(profile, "lead");

  useEffect(() => {
    if (!buka) return;
    setNama("");
    setTelepon("");
    setSumber("organik");
    setKategori(organik[0] || "");
    setGalat("");
    setKirim(false);
    // Fokus langsung ke nama: di lapangan, setiap ketukan tambahan berarti
    // menahan calon pembeli menunggu.
    setTimeout(() => namaRef.current?.focus(), 60);
  }, [buka, organik]);

  if (!boleh) return null;

  async function simpan(lanjutkan) {
    if (!nama.trim()) {
      setGalat("Nama atau username wajib diisi.");
      return;
    }
    setKirim(true);
    setGalat("");

    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: nama.trim(),
        phone: telepon.trim() || null,
        source_type: sumber,
        organik_kategori: sumber === "organik" ? kategori || null : null,
        status: "leads",
        // Tanpa ini RLS menyembunyikan baris dari orang yang baru saja membuatnya.
        assigned_to: profile?.id || null,
      })
      .select("id")
      .maybeSingle();

    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }

    toast.sukses(`${nama.trim()} tercatat sebagai prospek baru.`);
    segarkanNotifikasi();

    if (lanjutkan) {
      // Di pameran, prospek datang berturut-turut. Formulir dikosongkan dan
      // tetap terbuka supaya yang berikutnya tidak perlu membuka ulang.
      setNama("");
      setTelepon("");
      setGalat("");
      namaRef.current?.focus();
      return;
    }

    setBuka(false);
    if (data?.id) navigate(`/prospek?sorot=${data.id}`);
  }

  return (
    <>
      <button
        onClick={() => setBuka(true)}
        title="Prospek baru"
        aria-label="Tambah prospek baru"
        className="icon-btn tambah-cepat"
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: PRIMARY,
          border: `1px solid ${PRIMARY}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Plus size={19} />
      </button>

      <Modal open={buka} labelledBy="cepat-judul" onClose={() => !kirim && setBuka(false)} width={430}>
        <>
          <div id="cepat-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
            Prospek Baru
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 16, lineHeight: 1.55 }}>
            Cukup nama dan nomor. Sisanya dapat dilengkapi nanti dari halaman Prospek.
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="cepat-nama" style={label}>
              Nama / Username <span style={{ color: "#B93F0F" }}>*</span>
            </label>
            <input
              id="cepat-nama"
              ref={namaRef}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && simpan(false)}
              placeholder="mis. Budi Santoso"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="cepat-telp" style={label}>
              Nomor Telepon
            </label>
            <input
              id="cepat-telp"
              type="tel"
              inputMode="tel"
              value={telepon}
              onChange={(e) => setTelepon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && simpan(false)}
              placeholder="08…"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>Sumber</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { v: "organik", l: "Organik" },
                { v: "ads", l: "Ads" },
                { v: "freelance", l: "Freelance" },
              ].map((s) => {
                const aktif = sumber === s.v;
                return (
                  <button
                    key={s.v}
                    onClick={() => setSumber(s.v)}
                    aria-pressed={aktif}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 999,
                      border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                      background: aktif ? PRIMARY : SURFACE,
                      color: aktif ? "#fff" : TEXT_MID,
                      fontSize: 12.5,
                      fontWeight: aktif ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {s.l}
                  </button>
                );
              })}
            </div>

            {sumber === "organik" && organik.length > 0 && (
              <select value={kategori} onChange={(e) => setKategori(e.target.value)} aria-label="Kategori organik" style={{ ...inputStyle, marginTop: 9 }}>
                <option value="">Kategori organik</option>
                {organik.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            )}

            {sumber !== "organik" && (
              <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 8, lineHeight: 1.45, background: PRIMARY_SOFT, borderRadius: 10, padding: "8px 11px" }}>
                Campaign atau mitra asalnya dipilih nanti dari halaman Prospek.
              </div>
            )}
          </div>

          {galat && (
            <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>
              {galat}
            </div>
          )}

          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button onClick={() => setBuka(false)} disabled={kirim} style={sekunder}>
              Batal
            </button>
            <button onClick={() => simpan(true)} disabled={kirim} style={{ ...sekunder, borderColor: PRIMARY, color: PRIMARY }}>
              Simpan &amp; tambah lagi
            </button>
            <PrimaryButton onClick={() => simpan(false)} disabled={kirim}>
              {kirim ? "Menyimpan…" : "Simpan"}
            </PrimaryButton>
          </div>
        </>
      </Modal>
    </>
  );
}

const label = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const sekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
