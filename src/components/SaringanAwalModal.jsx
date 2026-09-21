import React, { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import LampiranTahap from "./LampiranTahap";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE, POSITIVE, inputStyle } from "./ui";

/**
 * Saringan awal — survei dan BI-Checking, sebelum booking.
 *
 * BRIEF §Progres KPR menuliskan alurnya secara eksplisit: "leads > Follow up
 * {jika berminat} > survei {melampirkan foto survei, Tanggal Survei} > BI
 * checking > melampirkan hasil BI checking > Booking", dan menegaskan
 * "Saringan Awal itu sebelum BI Checking itu sebelum booking".
 *
 * Sebelumnya keduanya hanya bisa dicatat setelah konsumen ada — artinya
 * setelah uang booking berpindah tangan. Dua dari tujuh alasan pembatalan yang
 * dikonfigurasi di sistem ini ("Tidak lolos BI-Checking", "RPC tidak cukup")
 * sepenuhnya dapat diketahui sebelum itu. Menaruh saringannya di belakang
 * berarti setiap kegagalan yang bisa dicegah berubah menjadi pengembalian uang.
 *
 * Data yang diisi di sini ikut terbawa ke berkas KPR saat konversi — begitu
 * pula lampirannya — sehingga Admin Marketing tidak pernah memintanya diulang.
 */
export default function SaringanAwalModal({ lead, open, onClose, onSelesai }) {
  const toast = useToast();
  const { profile } = useAuth();
  // Kebijakan berkas_lampiran_insert untuk lampiran yang masih menempel pada
  // prospek berbunyi owns_lead(). Peran yang hanya memantau tidak boleh
  // ditawari tombol unggah yang pasti ditolak.
  const bolehUbah = canWrite(profile, "lead");

  const [tanggalSurvei, setTanggalSurvei] = useState("");
  const [catatanSurvei, setCatatanSurvei] = useState("");
  const [bi, setBi] = useState("");
  const [biTanggal, setBiTanggal] = useState("");
  const [biCatatan, setBiCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    setTanggalSurvei(lead.tanggal_survei || "");
    setCatatanSurvei(lead.catatan_survei || "");
    setBi(lead.bi_checking_status || "");
    setBiTanggal(lead.bi_checking_tanggal || "");
    setBiCatatan(lead.bi_checking_catatan || "");
    setGalat("");
    setKirim(false);
  }, [open, lead]);

  async function simpan() {
    setKirim(true);
    setGalat("");
    const { error } = await supabase
      .from("leads")
      .update({
        tanggal_survei: tanggalSurvei || null,
        catatan_survei: catatanSurvei.trim() || null,
        bi_checking_status: bi || null,
        bi_checking_tanggal: biTanggal || null,
        bi_checking_catatan: biCatatan.trim() || null,
      })
      .eq("id", lead.id);
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    // Suhu prospek menyusul sendiri: trigger leads_saringan_temperature
    // membacanya dari baris yang baru saja tersimpan.
    toast.sukses(
      bi === "tidak_lolos"
        ? `${lead.name} ditandai tidak lolos BI-Checking.`
        : `Saringan awal ${lead.name} tersimpan.`
    );
    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="saring-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="saring-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Saringan Awal — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Survei dan BI-Checking dikerjakan <b style={{ color: TEXT_DARK }}>sebelum</b> booking. Hasilnya ikut terbawa ke
          berkas KPR begitu prospek ini dikonversi.
        </div>

        <Bagian judul="Survei Lokasi">
          <div className="rg-2" style={{ marginBottom: 11 }}>
            <div>
              <label htmlFor="sa-tgl-survei" style={labelGaya}>
                Tanggal Survei
              </label>
              <input id="sa-tgl-survei" type="date" value={tanggalSurvei} onChange={(e) => setTanggalSurvei(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="sa-catatan-survei" style={labelGaya}>
                Catatan Survei
              </label>
              <input
                id="sa-catatan-survei"
                value={catatanSurvei}
                onChange={(e) => setCatatanSurvei(e.target.value)}
                placeholder="-"
                style={inputStyle}
              />
            </div>
          </div>
          {/* Lampiran menempel pada prospek dan berpindah kepemilikan ke
              konsumen saat konversi — bukan disalin, supaya tidak ada dua
              salinan yang bisa menyimpang. */}
          <LampiranTahap slot="survei" leadId={lead.id} label="Foto Survei" hint="Foto lokasi bersama calon pembeli." editable={bolehUbah} />
        </Bagian>

        <Bagian judul="BI-Checking (SLIK)">
          <div className="rg-2" style={{ marginBottom: 11 }}>
            <div>
              <label htmlFor="sa-bi" style={labelGaya}>
                Hasil BI-Checking
              </label>
              <select id="sa-bi" value={bi} onChange={(e) => setBi(e.target.value)} style={inputStyle}>
                <option value="">Belum diperiksa</option>
                <option value="menunggu">Menunggu hasil</option>
                <option value="lolos">Lolos</option>
                <option value="tidak_lolos">Tidak lolos</option>
              </select>
            </div>
            <div>
              <label htmlFor="sa-bi-tgl" style={labelGaya}>
                Tanggal Pemeriksaan
              </label>
              <input id="sa-bi-tgl" type="date" value={biTanggal} onChange={(e) => setBiTanggal(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 11 }}>
            <label htmlFor="sa-bi-catatan" style={labelGaya}>
              Catatan
            </label>
            <input id="sa-bi-catatan" value={biCatatan} onChange={(e) => setBiCatatan(e.target.value)} placeholder="-" style={inputStyle} />
          </div>
          <LampiranTahap slot="bi_checking" leadId={lead.id} label="Hasil BI-Checking" hint="Lampirkan hasil pemeriksaan SLIK dari bank." editable={bolehUbah} />
        </Bagian>

        {bi === "tidak_lolos" && (
          <div
            role="alert"
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              background: "#FBE9E8",
              border: "1px solid #F2D3D1",
              borderRadius: 12,
              padding: "10px 13px",
              marginBottom: 16,
              fontSize: 12.5,
              color: NEGATIVE,
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>
              Konversi ke Booking akan ditolak selama hasilnya tidak lolos. Selesaikan dulu masalahnya, atau batalkan
              prospek beserta alasannya.
            </span>
          </div>
        )}

        {bi === "lolos" && (
          <div
            style={{
              display: "flex",
              gap: 9,
              alignItems: "center",
              background: "#E4F2E8",
              border: "1px solid #C6E3D0",
              borderRadius: 12,
              padding: "10px 13px",
              marginBottom: 16,
              fontSize: 12.5,
              color: POSITIVE,
              lineHeight: 1.5,
            }}
          >
            <ShieldCheck size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span>Lolos saringan awal — prospek ini siap dibooking.</span>
          </div>
        )}

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Tutup
          </button>
          <PrimaryButton subject="lead" onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : "Simpan Saringan Awal"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

function Bagian({ judul, children }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: "13px 15px", marginBottom: 14, background: SURFACE }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: PRIMARY, marginBottom: 11, letterSpacing: "0.03em", textTransform: "uppercase" }}>
        {judul}
      </div>
      {children}
    </div>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: PRIMARY_SOFT,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
