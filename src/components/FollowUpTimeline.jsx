import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, FileText, Landmark, KeyRound, Handshake } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { canWrite } from "../lib/permissions";
import { rupiah, tanggalWaktu, tanggal, labelJenisBayar } from "../lib/format";
import { Card, PrimaryButton, DeleteButton, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, NEGATIVE, inputStyle } from "./ui";

/**
 * Riwayat kronologis (PRD §4.2), digabung dari catatan manusia dan peristiwa
 * sistem.
 *
 * Versi sebelumnya hanya menampilkan catatan yang diketik seseorang, sehingga
 * hal-hal paling menentukan dalam sebuah transaksi properti — kuitansi
 * terverifikasi, berkas masuk bank, SP3K terbit, akad — tidak pernah muncul di
 * garis waktu yang sama. Untuk merekonstruksi urutan kejadian, orang harus
 * membuka tiga layar dan mencocokkannya sendiri.
 *
 * Peristiwa sistem ditandai berbeda dan tidak bisa dihapus: ia bukan catatan,
 * melainkan cerminan data di modul lain.
 */
export default function FollowUpTimeline({ leadId, customerId, title = "Riwayat Follow Up" }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [catatan, setCatatan] = useState([]);
  const [sistem, setSistem] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ activity: "", note: "", hasil: "" });

  const hasilOptions = useBusinessSettings("hasil_followup");
  const mayWrite = canWrite(profile, "followup");

  const fetchRows = useCallback(async () => {
    if (!leadId && !customerId) return;
    setLoading(true);

    // Sebuah konsumen membawa serta riwayat prospek asalnya — hubungan tidak
    // dimulai dari nol pada saat booking.
    const syarat = [leadId ? `lead_id.eq.${leadId}` : null, customerId ? `customer_id.eq.${customerId}` : null]
      .filter(Boolean)
      .join(",");

    const permintaan = [
      supabase.from("lead_activities").select("*, profiles(full_name)").or(syarat).order("created_at", { ascending: false }).limit(200),
    ];

    if (customerId) {
      permintaan.push(
        supabase.from("payments").select("id, payment_type, amount, status, payment_date, created_at").eq("customer_id", customerId),
        supabase.from("customer_documents").select("id, doc_type, status, uploaded_at").eq("customer_id", customerId),
        supabase.from("customer_kpr").select("*").eq("customer_id", customerId).maybeSingle()
      );
    }

    const hasil = await Promise.all(permintaan);
    setLoading(false);

    const [aktivitas, bayar, dokumen, kprRes] = hasil;
    if (aktivitas.error) {
      setError(aktivitas.error.message);
      return;
    }
    setError("");
    setCatatan(aktivitas.data || []);
    setSistem(customerId ? peristiwaSistem(bayar?.data, dokumen?.data, kprRes?.data) : []);
  }, [leadId, customerId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const gabungan = useMemo(() => {
    const semua = [
      ...catatan.map((r) => ({
        id: `a-${r.id}`,
        waktu: r.created_at,
        judul: r.activity,
        label: r.hasil,
        isi: r.note,
        aktor: r.profiles?.full_name || "Sistem",
        manual: true,
        asli: r,
      })),
      ...sistem,
    ];
    return semua.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  }, [catatan, sistem]);

  async function add() {
    if (!form.activity.trim() && !form.note.trim()) {
      setError("Isi aktivitas atau catatan terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("lead_activities").insert({
      lead_id: leadId || null,
      customer_id: customerId || null,
      actor_id: profile?.id || null,
      activity: form.activity.trim() || "Follow up",
      note: form.note.trim() || null,
      hasil: form.hasil || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      toast.gagal(`Catatan gagal disimpan: ${insertError.message}`);
      return;
    }
    setForm({ activity: "", note: "", hasil: "" });
    toast.sukses("Catatan tersimpan.");
    fetchRows();
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: TEXT_MID }}>
          {catatan.length} catatan
          {sistem.length > 0 && ` · ${sistem.length} peristiwa sistem`}
        </div>
      </div>

      {mayWrite && (
        <div style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 10 }}>
            <input
              placeholder="Aktivitas (mis. Telepon, WhatsApp, Survei)"
              aria-label="Jenis aktivitas"
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
              style={inputStyle}
            />
            <select value={form.hasil} onChange={(e) => setForm({ ...form, hasil: e.target.value })} aria-label="Hasil follow up" style={inputStyle}>
              <option value="">Hasil Follow Up</option>
              {withCurrentValue(hasilOptions, form.hasil).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <PrimaryButton subject="followup" onClick={add} disabled={saving} style={{ justifySelf: "start" }}>
              {saving ? "Menyimpan…" : "Tambah Catatan"}
            </PrimaryButton>
          </div>
          <textarea
            placeholder="Catatan komunikasi — isi selengkap mungkin, seluruh teks ini dapat dicari lewat kotak pencarian di atas."
            aria-label="Catatan komunikasi"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ ...inputStyle, minHeight: 62, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: NEGATIVE, marginBottom: 10 }}>{error}</div>}

      {loading && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Memuat riwayat…</div>}
      {!loading && gabungan.length === 0 && (
        <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada riwayat komunikasi.</div>
      )}

      <div>
        {gabungan.map((row, i) => {
          const Ikon = row.ikon;
          const terakhir = i === gabungan.length - 1;
          return (
            <div key={row.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: terakhir ? "none" : `1px solid ${BORDER}` }}>
              {/* Rel waktu: satu titik per entri, terbaru di atas. Peristiwa
                  sistem memakai ikon agar terbedakan dari catatan manusia. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 3 }}>
                {row.manual ? (
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      marginTop: 4,
                      borderRadius: "50%",
                      background: i === 0 ? ACCENT : PRIMARY_SOFT,
                      border: `1px solid ${i === 0 ? ACCENT : BORDER}`,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: PRIMARY_SOFT,
                      color: PRIMARY,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ikon size={12} />
                  </span>
                )}
                {!terakhir && <span style={{ flex: 1, width: 1, background: BORDER, marginTop: 4 }} />}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>{row.judul}</span>
                  {row.label && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "3px 9px", borderRadius: 999 }}>
                      {row.label}
                    </span>
                  )}
                </div>
                {row.isi && (
                  <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{row.isi}</div>
                )}
                <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 4 }}>
                  {row.manual ? `${row.aktor} · ${tanggalWaktu(row.waktu)}` : `Tercatat sistem · ${tanggal(row.waktu)}`}
                </div>
              </div>

              {row.manual && (
                <DeleteButton
                  subject="followup_delete"
                  itemName={row.judul}
                  onDelete={() => supabase.from("lead_activities").delete().eq("id", row.asli.id)}
                  onDone={fetchRows}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Menurunkan peristiwa dari data modul lain.
 *
 * Sengaja diturunkan saat render, bukan disimpan sebagai baris riwayat: kalau
 * disalin ke tabel sendiri, ia akan menyimpang begitu data aslinya dikoreksi.
 */
function peristiwaSistem(payments, documents, kpr) {
  const hasil = [];

  for (const p of payments || []) {
    if (p.status === "terverifikasi") {
      hasil.push({
        id: `p-${p.id}`,
        waktu: p.payment_date || p.created_at,
        judul: `${labelJenisBayar(p.payment_type)} terverifikasi`,
        isi: `${rupiah(p.amount)} — kuitansi resmi sudah diunggah Finance.`,
        ikon: Wallet,
        manual: false,
      });
    } else {
      hasil.push({
        id: `p-${p.id}`,
        waktu: p.payment_date || p.created_at,
        judul: `${labelJenisBayar(p.payment_type)} dicatat`,
        isi: `${rupiah(p.amount)} — menunggu verifikasi Finance.`,
        ikon: Wallet,
        manual: false,
      });
    }
  }

  for (const d of documents || []) {
    hasil.push({
      id: `d-${d.id}`,
      waktu: d.uploaded_at,
      judul: `Dokumen ${d.doc_type} diunggah`,
      isi: d.status === "ditolak" ? "Ditolak — perlu diunggah ulang." : d.status === "terverifikasi" ? "Sudah diverifikasi." : "Menunggu verifikasi.",
      ikon: FileText,
      manual: false,
    });
  }

  const tonggak = [
    { key: "tanggal_masuk_bank", judul: "Berkas masuk bank", ikon: Landmark },
    { key: "tanggal_sp3k_terbit", judul: "SP3K terbit", ikon: FileText },
    { key: "tanggal_akad", judul: "Akad", ikon: Handshake },
    { key: "tanggal_serah_terima_kunci", judul: "Serah terima kunci", ikon: KeyRound },
  ];

  for (const t of tonggak) {
    if (kpr?.[t.key]) {
      hasil.push({
        id: `k-${t.key}`,
        waktu: kpr[t.key],
        judul: t.judul,
        isi: t.key === "tanggal_masuk_bank" && kpr.nama_bank ? kpr.nama_bank : null,
        ikon: t.ikon,
        manual: false,
      });
    }
  }

  return hasil;
}
