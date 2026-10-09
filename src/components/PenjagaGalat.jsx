import React from "react";
import { AlertTriangle } from "lucide-react";
import { PAGE_BG, SURFACE, BORDER, TEXT_DARK, TEXT_MID, ACCENT, ACCENT_SOFT, ACCENT_DARK } from "./ui";

/**
 * Penangkap galat tampilan.
 *
 * Tanpa ini, satu galat di satu komponen membuat React melepas SELURUH
 * aplikasi: yang tersisa hanya latar kosong, tanpa menu, tanpa pesan, dan
 * tanpa petunjuk apa pun tentang penyebabnya. Itu pernah terjadi — ikon
 * `Map` dari lucide menutupi Map bawaan JavaScript di AppLayout, dan semua
 * orang melihat layar putih setelah login.
 *
 * @param kunci   bila berubah (mis. alamat halaman), galat lama dilupakan —
 *                pindah halaman tidak boleh tetap menampilkan galat halaman lain
 * @param diam    jangan tampilkan apa pun saat gagal (untuk pelengkap seperti
 *                pop-up, yang ketiadaannya tidak merugikan)
 * @param penuh   tampilan satu layar penuh, untuk penjaga paling luar
 */
export default class PenjagaGalat extends React.Component {
  constructor(props) {
    super(props);
    this.state = { galat: null };
  }

  static getDerivedStateFromError(galat) {
    return { galat };
  }

  componentDidCatch(galat, info) {
    console.error("Galat tampilan:", galat, info?.componentStack);
  }

  componentDidUpdate(sebelum) {
    if (this.state.galat && sebelum.kunci !== this.props.kunci) this.setState({ galat: null });
  }

  render() {
    const { galat } = this.state;
    if (!galat) return this.props.children;
    if (this.props.diam) return null;

    const isi = (
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "28px 26px", maxWidth: 520, width: "100%" }}>
        <div
          style={{ width: 46, height: 46, borderRadius: 14, background: ACCENT_SOFT, color: ACCENT_DARK, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}
        >
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 18, margin: "0 0 6px", color: TEXT_DARK }}>
          {this.props.penuh ? "Aplikasi gagal ditampilkan" : "Halaman ini gagal ditampilkan"}
        </h1>
        <p style={{ fontSize: 13, color: TEXT_MID, margin: "0 0 14px", lineHeight: 1.6 }}>
          Muat ulang halaman. Bila masih terjadi, kirimkan pesan di bawah ini kepada tim pengembang.
        </p>
        <pre
          style={{
            fontSize: 12,
            background: PAGE_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "10px 12px",
            margin: "0 0 18px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: TEXT_DARK,
          }}
        >
          {String(galat?.message || galat)}
        </pre>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button
            onClick={() => window.location.reload()}
            style={{ border: "none", background: ACCENT, color: "#fff", borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Muat ulang
          </button>
          {/* Tautan biasa, bukan router: penjaga paling luar berada di atas
              hal-hal yang mungkin justru sedang gagal. */}
          <a
            href="/"
            style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_DARK, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            Ke Dashboard
          </a>
        </div>
      </div>
    );

    if (!this.props.penuh) return <div style={{ padding: "24px 0", display: "flex", justifyContent: "center" }}>{isi}</div>;
    return (
      <div style={{ minHeight: "100vh", background: PAGE_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>{isi}</div>
    );
  }
}
