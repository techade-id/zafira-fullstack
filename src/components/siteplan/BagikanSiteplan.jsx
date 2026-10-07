import React, { useMemo, useState } from "react";
import { Copy, ExternalLink, MessageCircle, FileDown, ImageDown, RefreshCw, Globe } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { teksStokWa, tautanPublik } from "../../lib/siteplan";
import { Modal, ConfirmDialog, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, POSITIVE, inputStyle } from "../ui";

function tokenAcak() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Tiga cara siteplan sampai ke calon pembeli, berurutan dari yang paling
 * hidup: tautan publik (ketersediaan langsung dari sistem), teks stok untuk
 * grup WhatsApp, lalu PDF/gambar untuk dicetak atau diunggah.
 */
export default function BagikanSiteplan({ open, onClose, siteplan, proyek, kavling, fasilitas, bisaAtur, onBerubah, sekarang }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const [gantiToken, setGantiToken] = useState(false);
  const [hanyaTersedia, setHanyaTersedia] = useState(true);
  const [unduh, setUnduh] = useState("");

  const tautan = siteplan?.publik ? tautanPublik(siteplan.publik_token) : null;
  const teks = useMemo(
    () => (siteplan ? teksStokWa(kavling, { proyek: proyek?.name, siteplan: siteplan.nama, tautan, tampilHarga: siteplan.publik_tampil_harga !== false, sekarang }) : ""),
    [kavling, proyek, siteplan, tautan, sekarang]
  );

  if (!siteplan) return null;

  async function atur(perubahan, pesan) {
    setSibuk(true);
    const { error } = await supabase.from("siteplans").update(perubahan).eq("id", siteplan.id);
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    if (pesan) toast.sukses(pesan);
    onBerubah?.();
  }

  async function salin(isi, pesan) {
    try {
      await navigator.clipboard.writeText(isi);
      toast.sukses(pesan);
    } catch {
      toast.gagal("Tidak bisa menyalin otomatis di peramban ini.");
    }
  }

  async function unduhPdf() {
    setUnduh("pdf");
    try {
      const { unduhPriceList } = await import("../../lib/siteplanPdf");
      await unduhPriceList({ siteplan, proyek: proyek?.name, lokasi: proyek?.location, kavling, fasilitas, sekarang, hanyaTersedia, tampilHarga: true });
    } catch (e) {
      toast.gagal(`PDF gagal dibuat: ${e.message}`);
    }
    setUnduh("");
  }

  async function unduhPng() {
    setUnduh("png");
    try {
      const { unduhGambarSiteplan } = await import("../../lib/siteplanPdf");
      await unduhGambarSiteplan({ siteplan, proyek: proyek?.name, kavling, fasilitas, sekarang });
    } catch (e) {
      toast.gagal(`Gambar gagal dibuat: ${e.message}`);
    }
    setUnduh("");
  }

  return (
    <Modal open={open} labelledBy="bagikan-judul" onClose={onClose} width={560}>
      <div id="bagikan-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
        Bagikan {siteplan.nama}
      </div>
      <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18 }}>Yang dibagikan tidak pernah memuat nama konsumen, prospek, atau sales.</div>

      {/* ---------- Link publik ---------- */}
      <Bagian ikon={Globe} judul="Halaman publik" keterangan="Calon pembeli melihat ketersediaan langsung dari sistem — tanpa login. Status disederhanakan menjadi tersedia, dipesan, dan terjual.">
        {bisaAtur && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <Saklar
              nyala={siteplan.publik}
              label="Aktifkan halaman publik"
              disabled={sibuk}
              onUbah={(v) => atur({ publik: v }, v ? "Halaman publik aktif." : "Halaman publik dimatikan — tautan lama tidak lagi bisa dibuka.")}
            />
            <Saklar
              nyala={siteplan.publik_tampil_harga !== false}
              label="Tampilkan harga unit tersedia"
              disabled={sibuk || !siteplan.publik}
              onUbah={(v) => atur({ publik_tampil_harga: v })}
            />
          </div>
        )}
        {tautan ? (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input readOnly value={tautan} aria-label="Tautan publik" onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontSize: 12.5, flex: 1 }} />
              <button type="button" onClick={() => salin(tautan, "Tautan disalin.")} style={gayaTombol} aria-label="Salin tautan">
                <Copy size={14} />
              </button>
              <a href={tautan} target="_blank" rel="noopener noreferrer" style={{ ...gayaTombol, textDecoration: "none" }} aria-label="Buka halaman publik">
                <ExternalLink size={14} />
              </a>
            </div>
            {!siteplan.kontak_wa && (
              <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 6 }}>Nomor WhatsApp marketing belum diisi — tombol “Tanya unit ini” di halaman publik belum muncul. Isi lewat Pengaturan siteplan.</div>
            )}
            {bisaAtur && (
              <button type="button" onClick={() => setGantiToken(true)} style={{ ...gayaTautan, marginTop: 8 }}>
                <RefreshCw size={12} /> Buat tautan baru (tautan lama berhenti bekerja)
              </button>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: TEXT_MID }}>{bisaAtur ? "Nyalakan untuk mendapatkan tautan." : "Belum diaktifkan. Minta Admin Marketing menyalakannya."}</div>
        )}
      </Bagian>

      {/* ---------- WhatsApp ---------- */}
      <Bagian ikon={MessageCircle} judul="Daftar stok untuk WhatsApp" keterangan="Ringkasan unit tersedia per tipe, siap ditempel ke grup atau broadcast.">
        <textarea readOnly value={teks} rows={6} aria-label="Teks stok tersedia" style={{ ...inputStyle, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => salin(teks, "Daftar stok disalin.")} style={{ ...gayaTombol, gap: 6, padding: "7px 13px", fontSize: 12.5, fontWeight: 600 }}>
            <Copy size={13} /> Salin
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(teks)}`} target="_blank" rel="noopener noreferrer" style={{ ...gayaTombol, gap: 6, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, textDecoration: "none", color: POSITIVE }}>
            <MessageCircle size={13} /> Buka WhatsApp
          </a>
        </div>
      </Bagian>

      {/* ---------- Unduh ---------- */}
      <Bagian ikon={FileDown} judul="Unduh" keterangan="Untuk pameran, brosur, dan unggahan media sosial." akhir>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: TEXT_DARK, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={hanyaTersedia} onChange={(e) => setHanyaTersedia(e.target.checked)} />
          Tabel price list hanya memuat unit tersedia
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={unduhPdf} disabled={Boolean(unduh)} style={{ ...gayaTombol, gap: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 600 }}>
            <FileDown size={14} /> {unduh === "pdf" ? "Menyusun PDF…" : "PDF price list + peta"}
          </button>
          <button type="button" onClick={unduhPng} disabled={Boolean(unduh)} style={{ ...gayaTombol, gap: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 600 }}>
            <ImageDown size={14} /> {unduh === "png" ? "Merender…" : "Gambar siteplan (PNG)"}
          </button>
        </div>
      </Bagian>

      <ConfirmDialog
        open={gantiToken}
        title="Buat tautan publik baru?"
        message="Tautan yang sudah tersebar di grup, iklan, atau brosur akan berhenti bekerja."
        confirmLabel="Ganti tautan"
        busy={sibuk}
        onCancel={() => setGantiToken(false)}
        onConfirm={async () => {
          await atur({ publik_token: tokenAcak() }, "Tautan baru dibuat.");
          setGantiToken(false);
        }}
      />
    </Modal>
  );
}

function Bagian({ ikon: Ikon, judul, keterangan, akhir, children }) {
  return (
    <section style={{ paddingBottom: akhir ? 0 : 16, marginBottom: akhir ? 0 : 16, borderBottom: akhir ? "none" : `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, background: PRIMARY_SOFT, color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ikon size={15} />
        </span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_DARK }}>{judul}</div>
          <div style={{ fontSize: 12, color: TEXT_MID, lineHeight: 1.5 }}>{keterangan}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Saklar yang benar-benar switch bagi pembaca layar, bukan checkbox bergaya. */
export function Saklar({ nyala, label, onUbah, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(nyala)}
      onClick={() => onUbah(!nyala)}
      disabled={disabled}
      style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 10, border: "none", background: "none", padding: 0, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, fontSize: 13, color: TEXT_DARK, textAlign: "left" }}
    >
      <span aria-hidden="true" style={{ width: 34, height: 20, borderRadius: 999, background: nyala ? POSITIVE : "#CBD5E1", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
        <span style={{ position: "absolute", top: 2, left: nyala ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 0.15s" }} />
      </span>
      {label}
    </button>
  );
}

const gayaTombol = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 10,
  padding: "0 11px",
  minHeight: 36,
  cursor: "pointer",
};

const gayaTautan = { font: "inherit", display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "none", color: TEXT_MID, fontSize: 11.5, cursor: "pointer", padding: 0 };
