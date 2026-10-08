import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleOf } from "../lib/permissions";
import { useNotifications, LABEL_KATEGORI } from "../lib/useNotifications";
import { Card, SectionTitle, BORDER_SOFT, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_SOFT, ACCENT_DARK, POSITIVE } from "./ui";

/**
 * "Apa yang harus saya kerjakan hari ini?"
 *
 * Dashboard sebelumnya merender sepuluh kartu yang sama persis untuk ketujuh
 * peran: Sales harus melewati "Antrean Finance" dan "Rata-rata Durasi Tahap
 * KPR" — dua hal yang bukan urusannya — sebelum menemukan sesuatu yang bisa
 * ditindaklanjuti, dan Finance harus menggulir melewati funnel penjualan untuk
 * sampai ke antreannya sendiri.
 *
 * Itu dashboard *laporan*. Blok ini adalah dashboard *kerja*, dan diletakkan
 * paling atas. Laporannya tetap ada, hanya turun ke bawah.
 *
 * Angkanya datang dari my_notifications() — sumber yang sama dengan lonceng,
 * sehingga keduanya tidak mungkin berbeda.
 */

/** Kategori yang relevan per peran, berurut menurut kepentingannya. */
const PRIORITAS = {
  sales: ["hold", "followup", "dingin"],
  admin_marketing: ["hold", "sp3k", "mandek", "followup"],
  finance: ["verifikasi"],
  tim_lapangan: [],
  supervisor_marketing: ["verifikasi", "sp3k", "mandek", "followup", "dingin"],
  pengawas: ["verifikasi", "sp3k", "mandek", "followup", "dingin"],
  admin: ["verifikasi", "hold", "sp3k", "mandek", "followup", "dingin"],
};

const SARAN = {
  followup: "Buka Reminder",
  dingin: "Lihat prospek",
  sp3k: "Buka konsumen",
  mandek: "Buka konsumen",
  verifikasi: "Buka Pembayaran",
  hold: "Buka Siteplan",
};

const RUTE_KATEGORI = {
  followup: "/reminder",
  // Prospek yang mendingin ditangani di antrean follow-up, bukan di Leads
  // yang kini hanya berisi data awal.
  dingin: "/follow-up",
  sp3k: "/konsumen",
  mandek: "/konsumen",
  verifikasi: "/pembayaran",
  hold: "/siteplan",
};

export default function FokusHariIni() {
  const { profile } = useAuth();
  const { items, per_kategori, total, error, memuat } = useNotifications();
  const navigate = useNavigate();

  const peran = roleOf(profile);
  const urutan = PRIORITAS[peran] || PRIORITAS.sales;

  // Migrasi 013 belum jalan — diam saja, sisa dashboard tetap berguna.
  if (error) return null;

  const jumlah = new Map((per_kategori || []).map((k) => [k.kategori, Number(k.jumlah)]));
  const relevan = urutan.filter((k) => jumlah.get(k) > 0);

  if (memuat && total === 0) return null;

  return (
    <Card style={{ borderColor: BORDER_SOFT }}>
      <SectionTitle title="Fokus Hari Ini" />

      {relevan.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 0 4px" }}>
          <CheckCircle2 size={19} color={POSITIVE} style={{ flexShrink: 0 }} aria-hidden="true" />
          <div style={{ fontSize: 13, color: TEXT_DARK, lineHeight: 1.5 }}>
            Tidak ada yang tertunda.
            <span style={{ color: TEXT_MID }}> Semua pekerjaan yang jatuh tempo sudah ditangani.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="rg-3" style={{ marginBottom: relevan.length > 0 ? 16 : 0 }}>
            {relevan.map((kategori) => {
              const n = jumlah.get(kategori);
              const mendesak = (items || []).some((i) => i.kategori === kategori && i.urgensi === "tinggi");
              return (
                <button
                  key={kategori}
                  onClick={() => navigate(RUTE_KATEGORI[kategori])}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    padding: "14px 15px",
                    borderRadius: 15,
                    border: `1px solid ${mendesak ? "#F6CDB8" : BORDER_SOFT}`,
                    background: mendesak ? ACCENT_SOFT : SURFACE,
                    cursor: "pointer",
                    font: "inherit",
                    width: "100%",
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: mendesak ? ACCENT_DARK : TEXT_DARK }}>
                      {n}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: TEXT_MID, marginTop: 3 }}>{LABEL_KATEGORI[kategori]}</span>
                  </span>
                  <ArrowRight size={15} color={TEXT_MID} style={{ flexShrink: 0 }} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {/* Tiga teratas ditampilkan utuh — angka saja masih menuntut satu klik
              lagi untuk tahu siapa yang dimaksud. */}
          <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, paddingTop: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.04em", marginBottom: 10 }}>
              PALING MENDESAK
            </div>
            {(items || [])
              .filter((i) => urutan.includes(i.kategori))
              .slice(0, 3)
              .map((it, i) => (
                <button
                  key={`${it.kategori}-${it.record_id}-${i}`}
                  onClick={() => navigate(it.rute === "/konsumen" ? `/konsumen/${it.record_id}` : `${it.rute}?sorot=${it.record_id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "none",
                    padding: "9px 0",
                    cursor: "pointer",
                    font: "inherit",
                    borderBottom: i < 2 ? `1px solid ${BORDER_SOFT}` : "none",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: it.urgensi === "tinggi" ? ACCENT : PRIMARY_SOFT,
                      border: it.urgensi === "tinggi" ? "none" : `1px solid ${BORDER_SOFT}`,
                    }}
                    aria-hidden="true"
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.judul}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: TEXT_MID, marginTop: 2 }}>{it.detail}</span>
                  </span>
                  <span style={{ fontSize: 11.5, color: PRIMARY, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {SARAN[it.kategori] || "Buka"} →
                  </span>
                </button>
              ))}
          </div>
        </>
      )}
    </Card>
  );
}
