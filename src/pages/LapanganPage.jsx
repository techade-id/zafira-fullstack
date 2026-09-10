import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { canWrite, roleOf } from "../lib/permissions";
import {
  Card,
  PageTitle,
  PrimaryButton,
  Badge,
  BORDER,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_DARK,
  NEGATIVE,
  ReadOnlyBanner,
} from "../components/ui";

const STATUS_LABELS = {
  belum_mulai: "Belum Mulai",
  berjalan: "Berjalan",
  terlambat: "Terlambat",
  selesai: "Selesai",
};

function hariKe(target) {
  if (!target) return null;
  const t = new Date(`${target}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / (1000 * 60 * 60 * 24));
}

function ProgressBar({ percent, status }) {
  const warna = status === "terlambat" ? ACCENT : status === "selesai" ? "#15803D" : PRIMARY;
  return (
    <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 10, overflow: "hidden" }}>
      <div style={{ background: warna, height: "100%", width: `${Math.min(100, Math.max(0, percent || 0))}%`, transition: "width 0.3s ease" }} />
    </div>
  );
}

/** Satu unit yang dikerjakan, beserta form lapor dan riwayatnya. */
function ProyekLapangan({ proyek, bolehLapor, onTersimpan }) {
  const [buka, setBuka] = useState(false);
  const [riwayat, setRiwayat] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [simpan, setSimpan] = useState(false);
  const [error, setError] = useState("");

  const kosong = {
    report_date: new Date().toISOString().slice(0, 10),
    progress_percent: String(proyek.progress_percent ?? 0),
    kendala: "",
    solusi: "",
    notes: "",
  };
  const [form, setForm] = useState(kosong);
  const [fotoBefore, setFotoBefore] = useState(null);
  const [fotoAfter, setFotoAfter] = useState(null);

  const ambilRiwayat = useCallback(async () => {
    setMemuat(true);
    const { data } = await supabase
      .from("field_reports")
      .select("*, profiles(full_name)")
      .eq("field_project_id", proyek.id)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);
    setRiwayat(data || []);
    setMemuat(false);
  }, [proyek.id]);

  useEffect(() => {
    if (buka) ambilRiwayat();
  }, [buka, ambilRiwayat]);

  async function kirim() {
    setSimpan(true);
    setError("");

    // Foto diunggah lebih dulu; kalau gagal, laporannya tidak jadi disimpan
    // supaya tidak ada baris yang menunjuk berkas yang tidak pernah ada.
    let pathBefore = null;
    let pathAfter = null;
    for (const [file, set] of [[fotoBefore, (v) => (pathBefore = v)], [fotoAfter, (v) => (pathAfter = v)]]) {
      if (!file) continue;
      const { path, error: upErr } = await uploadFile("field-report-photos", proyek.id, file);
      if (upErr) {
        setError(`Gagal mengunggah foto: ${upErr.message}`);
        setSimpan(false);
        return;
      }
      set(path);
    }

    // reporter_id sengaja tidak dikirim — nilainya datang dari sesi lewat
    // default kolom, sehingga tidak bisa dipalsukan dari sini.
    const { error: dbErr } = await supabase.from("field_reports").insert({
      field_project_id: proyek.id,
      report_date: form.report_date,
      progress_percent: form.progress_percent === "" ? null : Number(form.progress_percent),
      kendala: form.kendala.trim() || null,
      solusi: form.solusi.trim() || null,
      notes: form.notes.trim() || null,
      photo_before_url: pathBefore,
      photo_after_url: pathAfter,
    });

    setSimpan(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setForm(kosong);
    setFotoBefore(null);
    setFotoAfter(null);
    ambilRiwayat();
    onTersimpan();
  }

  async function lihatFoto(path) {
    const url = await getSignedUrl("field-report-photos", path);
    if (url) window.open(url, "_blank");
  }

  const sisa = hariKe(proyek.target_end_date);
  const unit = proyek.units?.unit_code || "Unit";

  return (
    <Card style={{ marginBottom: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_DARK }}>{unit}</div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2 }}>
            {proyek.contractors?.name || "Tanpa kontraktor"}
            {proyek.units?.projects?.name ? ` · ${proyek.units.projects.name}` : ""}
          </div>
        </div>
        <Badge value={STATUS_LABELS[proyek.status] || proyek.status} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ fontWeight: 700, fontSize: 18, color: TEXT_DARK }}>{proyek.progress_percent ?? 0}%</span>
        {sisa != null && (
          <span style={{ color: sisa < 0 ? ACCENT_DARK : TEXT_MID }}>
            {sisa < 0 ? `Lewat ${Math.abs(sisa)} hari` : sisa === 0 ? "Jatuh tempo hari ini" : `${sisa} hari lagi`}
          </span>
        )}
      </div>
      <ProgressBar percent={proyek.progress_percent} status={proyek.status} />

      <button
        onClick={() => setBuka((v) => !v)}
        style={{
          width: "100%",
          marginTop: 12,
          border: `1px solid ${BORDER}`,
          background: "#fff",
          color: PRIMARY,
          borderRadius: 12,
          padding: "11px 12px",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {buka ? "Tutup" : bolehLapor ? "Lapor & Riwayat" : "Lihat Riwayat"}
      </button>

      {buka && (
        <div style={{ marginTop: 14 }}>
          {bolehLapor && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Laporan Hari Ini</div>

              <div className="field-grid">
                <label style={labelStyle}>
                  Tanggal
                  <input type="date" value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Progres (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    inputMode="numeric"
                    value={form.progress_percent}
                    onChange={(e) => setForm({ ...form, progress_percent: e.target.value })}
                    style={inputStyle}
                  />
                </label>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={form.progress_percent || 0}
                onChange={(e) => setForm({ ...form, progress_percent: e.target.value })}
                style={{ width: "100%", margin: "10px 0 14px", accentColor: ACCENT }}
              />

              <textarea placeholder="Kendala di lapangan" value={form.kendala} onChange={(e) => setForm({ ...form, kendala: e.target.value })} style={areaStyle} />
              <textarea placeholder="Solusi / tindakan" value={form.solusi} onChange={(e) => setForm({ ...form, solusi: e.target.value })} style={areaStyle} />
              <textarea placeholder="Catatan lain" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={areaStyle} />

              <div className="field-grid" style={{ marginTop: 4 }}>
                <FotoPicker label="Foto Sebelum" file={fotoBefore} onPick={setFotoBefore} />
                <FotoPicker label="Foto Sesudah" file={fotoAfter} onPick={setFotoAfter} />
              </div>

              {error && <div style={{ fontSize: 12, color: NEGATIVE, margin: "10px 0", lineHeight: 1.5 }}>{error}</div>}

              <PrimaryButton subject="field" onClick={kirim} disabled={simpan} style={{ width: "100%", marginTop: 12, padding: "13px 18px", fontSize: 14 }}>
                {simpan ? "Mengirim…" : "Kirim Laporan"}
              </PrimaryButton>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Riwayat Laporan</div>
            {memuat && <div style={{ fontSize: 12.5, color: TEXT_MID }}>Memuat…</div>}
            {!memuat && riwayat.length === 0 && <div style={{ fontSize: 12.5, color: TEXT_MID }}>Belum ada laporan.</div>}

            {riwayat.map((r, i) => (
              <div key={r.id} style={{ padding: "11px 0", borderBottom: i === riwayat.length - 1 ? "none" : `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, marginBottom: 3 }}>
                  <b style={{ color: TEXT_DARK }}>{new Date(`${r.report_date}T00:00:00`).toLocaleDateString("id-ID")}</b>
                  <span style={{ color: TEXT_MID }}>{r.progress_percent != null ? `${r.progress_percent}%` : "-"}</span>
                </div>
                {r.kendala && <div style={{ fontSize: 12.5, color: ACCENT_DARK, lineHeight: 1.5 }}>Kendala: {r.kendala}</div>}
                {r.solusi && <div style={{ fontSize: 12.5, color: TEXT_MID, lineHeight: 1.5 }}>Solusi: {r.solusi}</div>}
                {r.notes && <div style={{ fontSize: 12.5, color: TEXT_MID, lineHeight: 1.5 }}>{r.notes}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {r.photo_before_url && <FotoLink label="Sebelum" onClick={() => lihatFoto(r.photo_before_url)} />}
                  {r.photo_after_url && <FotoLink label="Sesudah" onClick={() => lihatFoto(r.photo_after_url)} />}
                  <span style={{ fontSize: 11, color: TEXT_MID }}>{r.profiles?.full_name || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function FotoPicker({ label, file, onPick }) {
  return (
    <label
      style={{
        display: "block",
        border: `1px dashed ${file ? PRIMARY : BORDER}`,
        borderRadius: 12,
        padding: "13px 12px",
        fontSize: 12.5,
        color: file ? PRIMARY : TEXT_MID,
        textAlign: "center",
        cursor: "pointer",
        background: file ? PRIMARY_SOFT : "#fff",
      }}
    >
      {file ? `✓ ${file.name.slice(0, 18)}` : `📷 ${label}`}
      {/* capture="environment" membuka kamera belakang langsung di HP. */}
      <input type="file" accept="image/*" capture="environment" onChange={(e) => onPick(e.target.files?.[0] || null)} style={{ display: "none" }} />
    </label>
  );
}

function FotoLink({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );
}

export default function LapanganPage() {
  const { profile } = useAuth();
  const [proyek, setProyek] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bolehLapor = canWrite(profile, "field");
  const timLapangan = roleOf(profile) === "tim_lapangan";

  const ambil = useCallback(async () => {
    setLoading(true);
    // RLS sudah menyaring: tim lapangan hanya menerima proyek yang ditugaskan
    // kepadanya, peran kantor menerima semuanya. Tidak ada filter di sini yang
    // perlu dipercaya.
    const { data, error: e } = await supabase
      .from("field_projects")
      .select("*, units(unit_code, projects(name)), contractors(name)")
      .order("target_end_date", { ascending: true, nullsFirst: false });
    setLoading(false);
    if (e) {
      setError(e.message);
      return;
    }
    setError("");
    setProyek(data || []);
  }, []);

  useEffect(() => {
    ambil();
  }, [ambil]);

  const terlambat = proyek.filter((p) => p.status === "terlambat").length;
  const berjalan = proyek.filter((p) => p.status === "berjalan").length;
  const selesai = proyek.filter((p) => p.status === "selesai").length;

  return (
    <div>
      <PageTitle
        title="Monitoring Lapangan"
        subtitle={timLapangan ? "Unit yang ditugaskan kepada Anda" : "Progres dan laporan pekerjaan seluruh unit"}
      />

      <ReadOnlyBanner />

      {error && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>{error}</div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 6 }}>
            Jalankan <code>supabase/migration_012_lapangan.sql</code> bila modul ini belum terpasang.
          </div>
        </Card>
      )}

      {proyek.length > 0 && (
        <div className="rg-3" style={{ marginBottom: 18 }}>
          <Ringkas label="Berjalan" nilai={berjalan} />
          <Ringkas label="Terlambat" nilai={terlambat} sorot={terlambat > 0} />
          <Ringkas label="Selesai" nilai={selesai} />
        </div>
      )}

      {loading && <Card><div style={{ fontSize: 13, color: TEXT_MID }}>Memuat…</div></Card>}

      {!loading && proyek.length === 0 && (
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, lineHeight: 1.6 }}>
            {timLapangan
              ? "Belum ada unit yang ditugaskan kepada Anda. Hubungi Admin Marketing untuk penugasan."
              : "Belum ada proyek lapangan. Buat penugasan unit terlebih dahulu agar tim dapat melapor."}
          </div>
        </Card>
      )}

      {proyek.map((p) => (
        <ProyekLapangan key={p.id} proyek={p} bolehLapor={bolehLapor} onTersimpan={ambil} />
      ))}
    </div>
  );
}

function Ringkas({ label, nilai, sorot }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: sorot ? ACCENT_DARK : TEXT_DARK }}>{nilai}</div>
    </Card>
  );
}

const labelStyle = { display: "block", fontSize: 11.5, color: TEXT_MID, marginBottom: 4 };

const inputStyle = {
  width: "100%",
  padding: "12px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  // 16px mencegah iOS Safari memperbesar halaman saat kolom difokuskan.
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
  marginTop: 3,
};

const areaStyle = {
  ...inputStyle,
  minHeight: 58,
  resize: "vertical",
  fontFamily: "inherit",
  marginBottom: 10,
};
