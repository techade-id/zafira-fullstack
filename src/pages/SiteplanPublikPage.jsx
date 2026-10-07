import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Asterisk, MapPin } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import PenjelajahSiteplan from "../components/siteplan/PenjelajahSiteplan";
import { PAGE_BG, SURFACE, BORDER, TEXT_MID, TEXT_DARK, PRIMARY_DARK, ACCENT } from "../components/ui";

/**
 * Halaman siteplan untuk calon pembeli — tanpa login.
 *
 * Tautannya dibagikan lewat WhatsApp, iklan, dan brosur. Datanya datang dari
 * siteplan_publik(), yang hanya melayani siteplan yang dinyalakan publiknya
 * dan tidak pernah memuat siapa pembeli, siapa sales, atau siapa yang sedang
 * menahan kavling — hanya apakah kavling itu masih bisa dibeli.
 *
 * Dimuat ulang tiap menit dan saat tab kembali aktif: halaman yang dibuka
 * pembeli kemarin malam tidak boleh tetap menawarkan kavling yang pagi ini
 * sudah dibooking.
 */
export default function SiteplanPublikPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [keadaan, setKeadaan] = useState("memuat");
  const [diperbarui, setDiperbarui] = useState(null);

  const muat = useCallback(async () => {
    const { data: hasil, error } = await supabase.rpc("siteplan_publik", { p_token: token });
    if (error || !hasil) {
      setKeadaan("hilang");
      return;
    }
    setData({
      ...hasil,
      kavling: (hasil.kavling || []).map((k) => ({
        id: k.kode,
        unit_code: k.kode,
        block: k.blok,
        type: k.tipe,
        price: k.harga,
        status_publik: k.status,
        luas_tanah: k.luas_tanah,
        luas_bangunan: k.luas_bangunan,
        posisi: k.posisi,
        hadap: k.hadap,
        bentuk: k.bentuk,
      })),
    });
    setDiperbarui(new Date());
    setKeadaan("siap");
  }, [token]);

  useEffect(() => {
    muat();
    const t = setInterval(muat, 60000);
    const saatTerlihat = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [muat]);

  useEffect(() => {
    if (data) document.title = `${data.proyek} — ${data.nama} · Zafira Property`;
  }, [data]);

  const tersedia = data ? data.kavling.filter((k) => k.status_publik === "tersedia").length : 0;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, color: TEXT_DARK }}>
      <header style={{ background: PRIMARY_DARK, color: "#fff" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.12)", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Asterisk size={19} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>Zafira Property</span>
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "22px 20px 40px" }}>
        {keadaan === "memuat" && <div style={{ padding: 40, textAlign: "center", color: TEXT_MID, fontSize: 14 }}>Memuat siteplan…</div>}

        {keadaan === "hilang" && (
          <div style={{ maxWidth: 460, margin: "60px auto", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "32px 28px", textAlign: "center" }}>
            <h1 style={{ fontSize: 19, margin: "0 0 8px" }}>Siteplan tidak tersedia</h1>
            <p style={{ fontSize: 13.5, color: TEXT_MID, lineHeight: 1.6, margin: 0 }}>Tautan ini sudah tidak dibagikan atau sudah diganti. Hubungi tim marketing Zafira Property untuk tautan terbaru.</p>
          </div>
        )}

        {keadaan === "siap" && data && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                {data.lokasi && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: TEXT_MID, marginBottom: 4 }}>
                    <MapPin size={13} aria-hidden="true" /> {data.lokasi}
                  </div>
                )}
                <h1 style={{ fontSize: 25, margin: 0, letterSpacing: "-0.02em" }}>
                  {data.proyek} <span style={{ color: TEXT_MID, fontWeight: 600 }}>· {data.nama}</span>
                </h1>
                {data.keterangan && <p style={{ fontSize: 13.5, color: TEXT_MID, margin: "4px 0 0" }}>{data.keterangan}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {tersedia}
                  <span style={{ fontSize: 14, color: TEXT_MID, fontWeight: 500 }}> / {data.kavling.length} unit tersedia</span>
                </div>
                {diperbarui && <div style={{ fontSize: 11.5, color: TEXT_MID }}>Ketersediaan per {diperbarui.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
            </div>

            <PenjelajahSiteplan
              siteplan={data}
              proyek={data.proyek}
              kavling={data.kavling}
              fasilitas={data.fasilitas || []}
              kontakWa={data.kontak_wa}
              tampilHarga={data.tampil_harga !== false}
            />

            <p style={{ fontSize: 12, color: TEXT_MID, marginTop: 20, lineHeight: 1.6 }}>
              Ketersediaan diambil langsung dari sistem penjualan Zafira Property. Harga dan ketersediaan dapat berubah sewaktu-waktu — konfirmasi ke tim marketing sebelum melakukan pembayaran.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
