import React, { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, ChevronRight } from "lucide-react";
import { telepon, tanggal, selisihHari } from "../lib/format";
import { SOURCE_TYPES } from "./ModalProspek";
import { Modal, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_DARK, inputStyle } from "./ui";

/**
 * Memulai follow-up: memilih satu lead dari data mentah yang belum pernah
 * di-follow up.
 *
 * Leads adalah kolam data awal; antrean Follow Up Leads hanya berisi prospek
 * yang sedang diproses. Daftar ini adalah satu-satunya jembatan di antara
 * keduanya — memilih sebuah lead membuka Catat Follow Up, dan begitu catatan
 * pertamanya tersimpan, lead itu pindah ke antrean.
 *
 * Diurutkan dari yang paling lama menunggu: lead yang dibiarkan paling lama
 * adalah yang paling dulu mendingin.
 */
export default function PilihLeadFollowUp({ open, leads, onClose, onPilih }) {
  const [cari, setCari] = useState("");

  useEffect(() => {
    if (open) setCari("");
  }, [open]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const angka = q.replace(/\D/g, "");
    if (!q) return leads;
    return leads.filter(
      (l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (angka.length >= 3 && String(l.phone || "").replace(/\D/g, "").includes(angka))
    );
  }, [leads, cari]);

  return (
    <Modal open={open} labelledBy="pilih-lead-judul" onClose={onClose} width={520}>
      <>
        <div id="pilih-lead-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Follow Up Lead
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14, lineHeight: 1.55 }}>
          {leads.length > 0
            ? `${leads.length} lead dari menu Leads belum pernah di-follow up. Pilih satu untuk mencatat follow-up pertamanya.`
            : "Semua lead sudah di-follow up."}
        </div>

        {leads.length > 0 && (
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={14} color={TEXT_MID} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} aria-hidden="true" />
            <input
              autoFocus
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama atau nomor…"
              aria-label="Cari lead"
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
        )}

        <div style={{ maxHeight: "52vh", overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>
          {tampil.map((l) => {
            const tunggu = -selisihHari(l.created_at);
            return (
              <button
                key={l.id}
                onClick={() => onPilih(l)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  textAlign: "left",
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginBottom: 7,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <span
                  style={{ width: 32, height: 32, borderRadius: 10, background: PRIMARY_SOFT, color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <UserPlus size={15} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.name}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: TEXT_MID, marginTop: 2 }}>
                    {telepon(l.phone)} · {labelSumber(l)}
                  </span>
                </span>
                <span
                  title={`Masuk ${tanggal(l.created_at)}`}
                  style={{ fontSize: 11.5, fontWeight: 600, color: tunggu >= 2 ? ACCENT_DARK : TEXT_MID, whiteSpace: "nowrap" }}
                >
                  {tunggu <= 0 ? "hari ini" : `${tunggu} hr`}
                </span>
                <ChevronRight size={15} color={TEXT_MID} aria-hidden="true" />
              </button>
            );
          })}
          {leads.length > 0 && tampil.length === 0 && (
            <div style={{ fontSize: 12.5, color: TEXT_MID, padding: "14px 2px" }}>Tidak ada lead yang cocok dengan “{cari}”.</div>
          )}
          {leads.length === 0 && (
            <div style={{ fontSize: 12.5, color: TEXT_MID, padding: "4px 2px 8px" }}>Lead baru yang dicatat di menu Leads akan muncul di sini.</div>
          )}
        </div>
      </>
    </Modal>
  );
}

function labelSumber(l) {
  const jenis = SOURCE_TYPES.find((s) => s.value === l.source_type)?.label;
  if (!jenis) return l.source || "sumber belum diisi";
  return l.source_type === "organik" && l.organik_detail ? `${jenis} · ${l.organik_detail}` : jenis;
}
