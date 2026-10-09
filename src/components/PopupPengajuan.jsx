import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePen, FileCheck, FileX, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import TinjauPengajuan, { kabarkanPengajuan } from "./TinjauPengajuan";
import { SURFACE, BORDER, TEXT_DARK, TEXT_MID, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_DARK, ACCENT_SOFT, NEGATIVE } from "./ui";

/**
 * Pop-up langsung untuk pengajuan perubahan catatan (migrasi 026).
 *
 * Lonceng menyegarkan diri setiap menit — cukup untuk follow-up yang jatuh
 * tempo hari ini, terlalu lambat untuk Sales yang sedang menunggu catatannya
 * disetujui. Lewat Supabase Realtime:
 *   · Admin Sistem mendapat pop-up begitu sebuah pengajuan masuk, dengan
 *     tombol Tinjau yang langsung membuka perbandingannya.
 *   · Pengaju mendapat pop-up begitu pengajuannya disetujui atau ditolak.
 *
 * Realtime menghormati RLS, jadi setiap orang hanya menerima pengajuan yang
 * memang boleh ia lihat. Seluruhnya bisa dimatikan di Pengaturan Bisnis
 * (app_settings.notif_realtime); saat mati, tidak ada langganan sama sekali
 * dan lonceng kembali ke penyegaran per menit.
 */

/** Dikirim Pengaturan Bisnis saat sakelarnya diubah, dengan detail true/false. */
export const EVENT_PENGATURAN_NOTIF = "pengaturan-notif-berubah";

const LAMA_TAMPIL_MS = 15000;

export default function PopupPengajuan() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const meId = profile?.id;
  const bolehPutus = canWrite(profile, "catatan_putus");

  const [aktif, setAktif] = useState(false);
  const [daftar, setDaftar] = useState([]);
  const [tinjauId, setTinjauId] = useState(null);

  useEffect(() => {
    if (!meId) return undefined;
    let hidup = true;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "notif_realtime")
      .maybeSingle()
      .then(({ data }) => {
        // Belum ada barisnya (migrasi 026 belum jalan) = menyala.
        if (hidup) setAktif((data?.value ?? "true") !== "false");
      });
    const ubah = (e) => setAktif(e.detail !== false);
    window.addEventListener(EVENT_PENGATURAN_NOTIF, ubah);
    return () => {
      hidup = false;
      window.removeEventListener(EVENT_PENGATURAN_NOTIF, ubah);
    };
  }, [meId]);

  const tutup = useCallback((key) => setDaftar((d) => d.filter((x) => x.key !== key)), []);

  const tambah = useCallback(
    (item) => {
      setDaftar((d) => [item, ...d.filter((x) => x.key !== item.key)].slice(0, 3));
      setTimeout(() => tutup(item.key), LAMA_TAMPIL_MS);
    },
    [tutup]
  );

  useEffect(() => {
    if (!aktif || !meId) return undefined;

    // Nama channel unik setiap kali dipasang. supabase.channel() mengembalikan
    // channel lama bila namanya sama dan channel itu belum selesai dilepas
    // (logout lalu login lagi di tab yang sama, atau Vite memuat ulang
    // komponen), dan menambahkan .on() ke channel yang sudah tersambung
    // melempar galat — di dalam efek, galat itu mematikan seluruh aplikasi.
    const topik = `pengajuan-catatan-${meId}-${Math.random().toString(36).slice(2, 10)}`;
    let kanal;
    try {
      kanal = supabase
        .channel(topik)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_activity_edits" }, async ({ new: e }) => {
          // Lonceng, angka di menu, dan halaman Persetujuan ikut segar.
          kabarkanPengajuan(e.lead_id);
          if (!bolehPutus || e.diajukan_oleh === meId || e.status !== "menunggu") return;
          const [{ data: lead }, { data: pengaju }] = await Promise.all([
            supabase.from("leads").select("name").eq("id", e.lead_id).maybeSingle(),
            supabase.from("profiles").select("full_name").eq("id", e.diajukan_oleh).maybeSingle(),
          ]);
          tambah({
            key: `baru-${e.id}`,
            jenis: "baru",
            editId: e.id,
            judul: "Pengajuan perubahan catatan",
            teks: `${pengaju?.full_name || "Sales"} mengajukan perubahan catatan ${e.aktivitas_baru} — ${lead?.name || "prospek"}.`,
          });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lead_activity_edits" }, async ({ new: e }) => {
          kabarkanPengajuan(e.lead_id);
          // Hanya pengajunya, dan hanya bila yang memutuskan orang lain.
          if (e.diajukan_oleh !== meId || e.status === "menunggu" || e.diputuskan_oleh === meId) return;
          const { data: lead } = await supabase.from("leads").select("name").eq("id", e.lead_id).maybeSingle();
          tambah({
            key: `putus-${e.id}`,
            jenis: e.status,
            leadId: e.lead_id,
            judul: e.status === "disetujui" ? "Perubahan catatan disetujui" : "Perubahan catatan ditolak",
            teks:
              e.status === "disetujui"
                ? `Catatan ${lead?.name || "prospek"} sudah berubah.`
                : `${lead?.name || "Prospek"}: ${e.alasan_tolak || "tanpa alasan"}`,
          });
        })
        .subscribe();
    } catch (err) {
      // Pop-up hanya pelengkap: tanpa Realtime, lonceng tetap menyegarkan
      // diri setiap menit. Tidak ada alasan aplikasi ikut berhenti.
      console.warn("Pop-up pengajuan tidak aktif:", err);
      return undefined;
    }

    return () => {
      supabase.removeChannel(kanal);
    };
  }, [aktif, meId, bolehPutus, tambah]);

  return (
    <>
      {daftar.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 78, right: 18, zIndex: 68, display: "flex", flexDirection: "column", gap: 10, width: "min(360px, calc(100vw - 36px))" }}
        >
          {daftar.map((p) => {
            const Ikon = p.jenis === "baru" ? FilePen : p.jenis === "disetujui" ? FileCheck : FileX;
            const warna = p.jenis === "ditolak" ? NEGATIVE : p.jenis === "baru" ? ACCENT_DARK : PRIMARY;
            return (
              <div
                key={p.key}
                style={{
                  display: "flex",
                  gap: 11,
                  alignItems: "flex-start",
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderLeft: `4px solid ${p.jenis === "baru" ? ACCENT : warna}`,
                  borderRadius: 14,
                  padding: "12px 12px 12px 13px",
                  boxShadow: "0 18px 40px rgba(15,42,92,0.16)",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: p.jenis === "baru" ? ACCENT_SOFT : PRIMARY_SOFT,
                    color: warna,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ikon size={15} aria-hidden="true" />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_DARK }}>{p.judul}</div>
                  <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2, lineHeight: 1.45 }}>{p.teks}</div>
                  <button
                    onClick={() => {
                      tutup(p.key);
                      if (p.jenis === "baru") setTinjauId(p.editId);
                      else navigate(`/follow-up?sorot=${p.leadId}`);
                    }}
                    style={{ marginTop: 8, border: "none", background: "none", padding: 0, color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {p.jenis === "baru" ? "Tinjau sekarang →" : "Lihat prospek →"}
                  </button>
                </div>
                <button
                  onClick={() => tutup(p.key)}
                  aria-label="Tutup pemberitahuan"
                  style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 2, lineHeight: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <TinjauPengajuan editId={tinjauId} open={Boolean(tinjauId)} onClose={() => setTinjauId(null)} />
    </>
  );
}
