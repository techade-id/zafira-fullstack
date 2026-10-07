import React, { useEffect, useState } from "react";
import { Search, Check, Star } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { telepon } from "../../lib/format";
import { Modal, PrimaryButton, Badge, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_DARK, inputStyle } from "../ui";

/** Tahap yang sudah lewat booking — prospeknya tidak bisa ditahankan kavling lagi. */
const SUDAH_LEWAT = "(cancel,booking,kpr,akad,aftersales,deal,closing)";

/**
 * Memilih prospek untuk sebuah kavling: Tahan, Tandai minat, atau Booking.
 *
 * Peminat kavling ini ditaruh paling atas — prospek yang sudah menyatakan
 * minat pada kavling inilah yang paling mungkin sedang dibicarakan.
 * RLS pada leads sudah membatasi Sales pada prospeknya sendiri.
 */
export default function ModalPilihProspek({ open, judul, keterangan, labelTombol = "Pilih", unitId, denganCatatan = false, onPilih, onClose }) {
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState([]);
  const [peminat, setPeminat] = useState(new Set());
  const [memuat, setMemuat] = useState(false);
  const [dipilih, setDipilih] = useState(null);
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setCari("");
    setDipilih(null);
    setCatatan("");
    setGalat("");
    if (!unitId) {
      setPeminat(new Set());
      return;
    }
    supabase
      .from("unit_minat")
      .select("lead_id")
      .eq("unit_id", unitId)
      .then(({ data }) => setPeminat(new Set((data || []).map((r) => r.lead_id))));
  }, [open, unitId]);

  useEffect(() => {
    if (!open) return undefined;
    let batal = false;
    const t = setTimeout(async () => {
      setMemuat(true);
      let q = supabase
        .from("leads")
        .select("id, name, phone, email, status, agen:profiles!leads_assigned_to_fkey(full_name)")
        .not("status", "in", SUDAH_LEWAT)
        .order("created_at", { ascending: false })
        .limit(40);
      // Tanda baca sintaks filter PostgREST dibuang dari kata kunci.
      const kata = cari.replace(/[,()*%]/g, " ").trim();
      if (kata) q = q.or(`name.ilike.%${kata}%,phone.ilike.%${kata}%`);
      const { data } = await q;
      if (!batal) {
        setHasil(data || []);
        setMemuat(false);
      }
    }, 220);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [open, cari]);

  const urut = [...hasil].sort((a, b) => Number(peminat.has(b.id)) - Number(peminat.has(a.id)));

  async function jalankan() {
    if (!dipilih) return;
    setKirim(true);
    setGalat("");
    const pesan = await onPilih(dipilih, catatan);
    setKirim(false);
    if (pesan) setGalat(pesan);
  }

  return (
    <Modal open={open} labelledBy="pilih-prospek-judul" onClose={() => !kirim && onClose?.()} width={480}>
      <div id="pilih-prospek-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
        {judul}
      </div>
      {keterangan && <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>{keterangan}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 12px", marginBottom: 10 }}>
        <Search size={15} color={TEXT_MID} aria-hidden="true" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama atau nomor prospek"
          aria-label="Cari nama atau nomor prospek"
          style={{ flex: 1, border: "none", outline: "none", padding: "10px 0", fontSize: 13, background: "transparent", color: TEXT_DARK }}
        />
      </div>

      <div role="listbox" aria-label="Prospek" style={{ maxHeight: 290, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12 }}>
        {memuat && hasil.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: TEXT_MID }}>Memuat prospek…</div>}
        {!memuat && hasil.length === 0 && (
          <div style={{ padding: 14, fontSize: 12.5, color: TEXT_MID }}>Tidak ada prospek aktif yang cocok. Prospek yang batal atau sudah booking tidak ditampilkan.</div>
        )}
        {urut.map((l, i) => {
          const aktif = dipilih?.id === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={aktif}
              onClick={() => setDipilih(l)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                background: aktif ? PRIMARY_SOFT : SURFACE,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span style={{ width: 18, flexShrink: 0, color: PRIMARY }}>{aktif && <Check size={16} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>
                  {l.name}
                  {peminat.has(l.id) && (
                    <span title="Sudah menandai minat pada kavling ini" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 600, color: ACCENT_DARK }}>
                      <Star size={11} fill="currentColor" aria-hidden="true" /> peminat
                    </span>
                  )}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: TEXT_MID }}>
                  {telepon(l.phone)}
                  {l.agen?.full_name ? ` · ${l.agen.full_name}` : ""}
                </span>
              </span>
              <Badge value={l.status} />
            </button>
          );
        })}
      </div>

      {denganCatatan && (
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Catatan (opsional) — mis. menunggu transfer booking fee Jumat"
          aria-label="Catatan"
          rows={2}
          style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
        />
      )}

      {galat && <div style={{ fontSize: 12.5, color: "#A6332C", background: "#FBE9E8", borderRadius: 10, padding: "9px 12px", marginBottom: 12, lineHeight: 1.5 }}>{galat}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={kirim} style={gayaSekunder}>
          Batal
        </button>
        <PrimaryButton onClick={jalankan} disabled={!dipilih || kirim}>
          {kirim ? "Memproses…" : labelTombol}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

export const gayaSekunder = {
  padding: "10px 18px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_MID,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
