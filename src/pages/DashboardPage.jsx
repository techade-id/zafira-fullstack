import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import FokusHariIni, { BannerPersetujuan } from "../components/FokusHariIni";
import FilterPeriode, { rangeToDates, labelRange } from "../components/FilterPeriode";
import { Card, BarChart, TEXT_MID, TEXT_DARK, BORDER_SOFT, POSITIVE, NEGATIVE } from "../components/ui";

/**
 * Dashboard menjawab satu pertanyaan: bulan ini sudah sampai mana.
 *
 * Laporan yang dibaca sesekali — funnel, durasi tahap KPR, rekap berkas,
 * sumber leads, performa agen — pindah ke halaman Laporan
 * (components/AnalitikPenjualan.jsx). Yang tersisa di sini hanya pekerjaan hari
 * ini, empat angka utama, hitungan per prosedur, dan prospek masuk.
 */

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Hitungan per prosedur — BRIEF §Dashboard: "Untuk bagian filter prosedurnya
 * berapa, lalu bookingnya berapa dll yang berada di dashboard".
 *
 * Dihitung dari tanggal peristiwanya, bukan tanggal prospek dibuat: akad bulan
 * ini nyaris tidak pernah berasal dari prospek bulan ini.
 */
const PROSEDUR = [
  { key: "prospek_baru", label: "Prospek Baru" },
  { key: "follow_up", label: "Follow Up" },
  { key: "survei", label: "Survei" },
  { key: "bi_checking", label: "BI-Checking" },
  { key: "booking", label: "Booking" },
  { key: "masuk_bank", label: "Masuk Bank" },
  { key: "sp3k", label: "SP3K Terbit" },
  { key: "akad", label: "Akad" },
  { key: "serah_terima", label: "Serah Terima" },
  { key: "batal", label: "Batal", negatif: true },
];

const KARTU = { borderColor: BORDER_SOFT };

/** Percent change of `current` vs `previous`, or null when there's no baseline. */
function trendOf(current, previous) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  return { up: pct >= 0, label: `${Math.abs(pct).toFixed(0)}%` };
}

/** "2026-07-27" -> "Sen". Parsed as local time so the label can't slip a day. */
function dayLabel(isoDate) {
  return DAY_LABELS[new Date(`${isoDate}T00:00:00`).getDay()];
}

/** Satu angka utama: label, nilai, satu baris keterangan. Tanpa ikon. */
function Angka({ label, value, trend, sub }) {
  return (
    <Card style={{ ...KARTU, padding: "18px 20px" }}>
      <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT_DARK, lineHeight: 1.1 }}>{value}</div>
      {(trend || sub) && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {trend && (
            <span style={{ color: trend.up ? POSITIVE : NEGATIVE, fontWeight: 600, marginRight: 6 }}>
              {trend.up ? "↗" : "↘"} {trend.label}
            </span>
          )}
          {sub}
        </div>
      )}
    </Card>
  );
}

function JudulKartu({ judul, keterangan }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: TEXT_DARK }}>{judul}</span>
      {keterangan && <span style={{ fontSize: 12, color: TEXT_MID }}>{keterangan}</span>}
    </div>
  );
}

/**
 * Hitungan per prosedur pada periode terpilih, sebagai daftar label–angka.
 * Batal dipisah oleh satu garis karena bukan bagian dari alur maju.
 */
function DaftarProsedur({ periode, label }) {
  return (
    <Card style={KARTU}>
      <JudulKartu judul="Prosedur" keterangan={label} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {PROSEDUR.map((x) => {
          const n = Number(periode[x.key] || 0);
          return (
            <div
              key={x.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                padding: "6px 0",
                fontSize: 13,
                ...(x.negatif && { marginTop: 6, paddingTop: 12, borderTop: `1px solid ${BORDER_SOFT}` }),
              }}
            >
              <span style={{ color: TEXT_MID }}>{x.label}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: x.negatif && n > 0 ? NEGATIVE : TEXT_DARK }}>{n}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  // Aggregates come from the dashboard_stats() RPC so they're computed in
  // Postgres — counting rows in the browser silently capped at 1000.
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });

  useEffect(() => {
    let batal = false;
    const { from, to } = rangeToDates(range, custom);
    supabase.rpc("dashboard_stats", { p_from: from, p_to: to }).then(({ data, error: statsError }) => {
      if (batal) return;
      setError(statsError ? statsError.message : "");
      setStats(data || null);
    });
    // Respons periode lama yang tiba belakangan tidak boleh menimpa yang baru.
    return () => {
      batal = true;
    };
  }, [range, custom.from, custom.to]);

  const s = stats || {};
  const totalLeads = s.total_leads || 0;
  const dealCount = s.deal_count || 0;
  const appointmentCount = s.appointment_count || 0;
  const closingRate = totalLeads ? (dealCount / totalLeads) * 100 : 0;
  const apptToDeal = appointmentCount + dealCount ? (dealCount / (appointmentCount + dealCount)) * 100 : 0;

  const leadsThisMonth = s.leads_this_month || 0;
  const dealsThisMonth = s.deals_this_month || 0;
  const unitsAvailable = s.units_available || 0;
  const unitsTotal = s.units_total || 0;

  // Pada "Bulan ini" nilai kartunya sudah angka bulan ini; mengulanginya di
  // baris bawah hanya menambah teks.
  const bulanIni = range === "month";
  const trendLeads = trendOf(leadsThisMonth, s.leads_prev_month || 0);
  const trendDeals = trendOf(dealsThisMonth, s.deals_prev_month || 0);

  const weekData = (s.by_day || []).map((d) => ({ label: dayLabel(d.day), value: Number(d.value) }));
  const maxWeek = weekData.length ? Math.max(...weekData.map((d) => d.value)) : 0;
  const highlightIndex = maxWeek > 0 ? weekData.findIndex((d) => d.value === maxWeek) : -1;

  // Ditambahkan migration_017; sebelum migrasi itu jalan, daftarnya tidak dirender.
  const periode = s.periode || null;

  const grafik = (
    <Card style={KARTU}>
      <JudulKartu judul="Prospek Masuk" keterangan="7 hari terakhir" />
      <BarChart data={weekData} highlightIndex={highlightIndex} height={286} />
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <Card style={{ borderColor: "#F2D3D1" }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>
            Gagal memuat ringkasan: {error}. Pastikan migrasi Supabase sudah dijalankan sampai{" "}
            <code>migration_010_dashboard_and_ads.sql</code>.
          </div>
        </Card>
      )}

      {/* Pekerjaan lebih dulu, angka menyusul — dan yang membuat orang lain
          menunggu lebih dulu lagi. */}
      <BannerPersetujuan />
      <FokusHariIni />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: TEXT_DARK }}>Ringkasan</span>
        <FilterPeriode range={range} onRange={setRange} custom={custom} onCustom={setCustom} />
      </div>

      <div className="rg-4">
        <Angka
          label="Total Prospek"
          value={totalLeads}
          trend={trendLeads}
          sub={bulanIni ? trendLeads && "dari bulan lalu" : `${leadsThisMonth} bulan ini`}
        />
        <Angka
          label="Booking ke Atas"
          value={dealCount}
          trend={trendDeals}
          sub={bulanIni ? trendDeals && "dari bulan lalu" : `${dealsThisMonth} bulan ini`}
        />
        <Angka label="Closing Rate" value={`${closingRate.toFixed(1)}%`} sub={`${apptToDeal.toFixed(0)}% dari Hot Lead`} />
        <Angka label="Unit Tersedia" value={unitsAvailable} sub={unitsTotal ? `dari ${unitsTotal} unit` : "belum ada unit"} />
      </div>

      {periode ? (
        <div className="chart-row">
          {grafik}
          <DaftarProsedur periode={periode} label={labelRange(range)} />
        </div>
      ) : (
        grafik
      )}
    </div>
  );
}
