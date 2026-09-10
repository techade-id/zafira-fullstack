import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Clock, Snowflake, FileWarning, Landmark, Wallet } from "lucide-react";
import { useNotifications, LABEL_KATEGORI } from "../lib/useNotifications";
import { SURFACE, BORDER, TEXT_DARK, TEXT_MID, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_DARK, RADIUS_SM } from "./ui";

const IKON = {
  followup: Clock,
  dingin: Snowflake,
  sp3k: FileWarning,
  mandek: Landmark,
  verifikasi: Wallet,
};

/**
 * Lonceng notifikasi.
 *
 * Sebelumnya ikon ini dirender tanpa `onClick` sama sekali — sebuah kontrol
 * mati yang terlihat hidup, yang setiap kali diklik mengajari penggunanya
 * bahwa aplikasi ini tidak sepenuhnya bisa dipercaya.
 */
export default function NotifBell() {
  const { total, tinggi, items, error } = useNotifications();
  const [buka, setBuka] = useState(false);
  const kotak = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onDocClick(e) {
      if (kotak.current && !kotak.current.contains(e.target)) setBuka(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setBuka(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Dikelompokkan supaya isinya terbaca sebagai jenis pekerjaan, bukan tiga
  // puluh baris yang harus dipilah sendiri.
  const kelompok = [];
  const indeks = new Map();
  for (const it of items || []) {
    if (!indeks.has(it.kategori)) {
      indeks.set(it.kategori, kelompok.length);
      kelompok.push({ kategori: it.kategori, rows: [] });
    }
    kelompok[indeks.get(it.kategori)].rows.push(it);
  }

  return (
    <div ref={kotak} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setBuka((v) => !v)}
        aria-label={total > 0 ? `Notifikasi, ${total} perlu perhatian` : "Notifikasi"}
        aria-expanded={buka}
        title="Notifikasi"
        className="icon-btn notif-btn"
        style={{
          position: "relative",
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          color: TEXT_DARK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Bell size={17} />
        {total > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              // Merah hanya untuk yang benar-benar mendesak; kalau semua merah,
              // tidak ada yang merah.
              background: tinggi > 0 ? ACCENT : PRIMARY,
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${SURFACE}`,
              boxSizing: "content-box",
            }}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {buka && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "min(380px, 92vw)",
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: RADIUS_SM + 4,
            boxShadow: "0 18px 40px rgba(15,42,92,0.14)",
            padding: 8,
            maxHeight: "70vh",
            overflowY: "auto",
            zIndex: 55,
          }}
        >
          <div style={{ padding: "8px 10px 6px", fontSize: 13, fontWeight: 700 }}>
            Perlu perhatian
            {total > 0 && <span style={{ fontWeight: 500, color: TEXT_MID }}> · {total}</span>}
          </div>

          {error && (
            <div style={{ padding: "10px 10px 12px", fontSize: 12, color: TEXT_MID, lineHeight: 1.5 }}>
              Ringkasan belum tersedia. Jalankan <code>migration_013_crm_flow.sql</code> terlebih dahulu.
            </div>
          )}

          {!error && total === 0 && (
            <div style={{ padding: "18px 10px 22px", fontSize: 12.5, color: TEXT_MID, textAlign: "center", lineHeight: 1.55 }}>
              Tidak ada yang menunggu.
              <br />
              Semua follow-up sudah terjadwal ke depan.
            </div>
          )}

          {kelompok.map((g) => {
            const Ikon = IKON[g.kategori] || Clock;
            return (
              <div key={g.kategori} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: TEXT_MID,
                    padding: "9px 10px 5px",
                  }}
                >
                  <Ikon size={12} aria-hidden="true" />
                  {LABEL_KATEGORI[g.kategori] || g.kategori}
                  <span style={{ marginLeft: "auto", fontWeight: 600 }}>{g.rows.length}</span>
                </div>
                {g.rows.map((it, i) => (
                  <button
                    key={`${it.kategori}-${it.record_id}-${i}`}
                    onClick={() => {
                      setBuka(false);
                      navigate(it.rute === "/konsumen" ? `/konsumen/${it.record_id}` : `${it.rute}?sorot=${it.record_id}`);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F4F6FA")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.judul}
                      </span>
                      {it.urgensi === "tinggi" && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: ACCENT_DARK, background: "#FDECE4", padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>
                          MENDESAK
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 2, lineHeight: 1.45 }}>{it.detail}</div>
                  </button>
                ))}
              </div>
            );
          })}

          {total > (items?.length || 0) && (
            <div style={{ padding: "8px 10px", fontSize: 11.5, color: TEXT_MID }}>
              Menampilkan {items.length} dari {total}. Sisanya ada di halaman Reminder.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
