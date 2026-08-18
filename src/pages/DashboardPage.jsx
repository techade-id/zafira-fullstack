import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Card,
  SectionTitle,
  DataTable,
  StatCard,
  BarChart,
  DonutChart,
  ListRow,
  TEXT_MID,
  PRIMARY,
  PRIMARY_SOFT,
  BORDER,
} from "../components/ui";
import { Users, Handshake, TrendingUp, Home, Wallet, MessageSquareWarning, FolderCheck } from "lucide-react";

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const RANGES = [
  { key: "all", label: "Semua" },
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
  { key: "month", label: "Bulan ini" },
  { key: "custom", label: "Kustom" },
];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Turn the selected preset into the {from,to} the RPC expects. */
function rangeToDates(key, custom) {
  const today = new Date();
  if (key === "all") return { from: null, to: null };
  if (key === "custom") return { from: custom.from || null, to: custom.to || null };
  if (key === "month") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  }
  const back = new Date(today);
  back.setDate(today.getDate() - Number(key));
  return { from: iso(back), to: iso(today) };
}

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

function roundDays(v) {
  return v == null ? null : Math.round(Number(v));
}

export default function DashboardPage() {
  // Aggregates come from the dashboard_stats() RPC so they're computed in
  // Postgres — counting rows in the browser silently capped at 1000.
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });

  useEffect(() => {
    async function load() {
      const { from, to } = rangeToDates(range, custom);
      const [{ data: s, error: statsError }, { data: pm }, { data: cp }] = await Promise.all([
        supabase.rpc("dashboard_stats", { p_from: from, p_to: to }),
        supabase.from("payments").select("id, amount, payment_type, payment_date, status, customers(name)").order("payment_date", { ascending: false }).limit(4),
        supabase.from("complaints").select("id, category, description, priority, status, created_at, customers(name), units(unit_code)").order("created_at", { ascending: false }).limit(4),
      ]);
      if (statsError) setError(statsError.message);
      setStats(s || null);
      setPayments(pm || []);
      setComplaints(cp || []);
    }
    load();
    // Re-fetch whenever the period changes; custom dates only once both are set.
  }, [range, custom.from, custom.to]);

  const s = stats || {};
  const totalLeads = s.total_leads || 0;
  const dealCount = s.deal_count || 0;
  const appointmentCount = s.appointment_count || 0;
  const closingRate = totalLeads ? (dealCount / totalLeads) * 100 : 0;
  const apptToDeal = appointmentCount + dealCount ? (dealCount / (appointmentCount + dealCount)) * 100 : 0;

  const weekData = (s.by_day || []).map((d) => ({ label: dayLabel(d.day), value: Number(d.value) }));
  const donutData = (s.by_status || []).map((d) => ({ label: d.label, value: Number(d.value) }));

  const d = s.kpr_durations || {};
  const stageDurations = [
    { label: "Pengumpulan Berkas", value: roundDays(d.berkas) },
    { label: "SP3K → Akad", value: roundDays(d.sp3k_akad) },
    { label: "Persiapan Akad", value: roundDays(d.akad) },
    { label: "Persiapan Serah Terima", value: roundDays(d.serah) },
  ];

  const perAgent = (s.by_agent || []).map((a) => ({ name: a.name, leads: Number(a.leads), deals: Number(a.deals) }));

  const berkasRecap = (s.berkas_recap || []).map((b) => ({ ...b, lama_hari: b.lama_hari == null ? null : Number(b.lama_hari) }));
  const berkasSummary = (s.berkas_summary || []).map((b) => ({ label: b.label, value: Number(b.value) }));
  const maxSource = Math.max(1, ...(s.by_source || []).map((x) => Number(x.leads)));

  const sourceRows = (s.by_source || []).map((x) => ({
    source: x.source,
    leads: Number(x.leads),
    deals: Number(x.deals),
    rate: Number(x.leads) ? ((Number(x.deals) / Number(x.leads)) * 100).toFixed(1) + "%" : "-",
  }));

  const maxWeek = weekData.length ? Math.max(...weekData.map((d) => d.value)) : 0;
  const highlightIndex = maxWeek > 0 ? weekData.findIndex((d) => d.value === maxWeek) : -1;

  const leadsThisMonth = s.leads_this_month || 0;
  const dealsThisMonth = s.deals_this_month || 0;
  const unitsAvailable = s.units_available || 0;
  const unitsTotal = s.units_total || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <Card style={{ borderColor: "#e6c9c9" }}>
          <div style={{ fontSize: 13, color: "#c25b5b" }}>
            Gagal memuat ringkasan: {error}. Pastikan <code>migration_005_roles_and_dashboard.sql</code> sudah dijalankan di Supabase.
          </div>
        </Card>
      )}

      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, marginRight: 2 }}>Periode</span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${range === r.key ? PRIMARY : BORDER}`,
                background: range === r.key ? PRIMARY : "#fff",
                color: range === r.key ? "#fff" : TEXT_MID,
                fontSize: 12.5,
                fontWeight: range === r.key ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={dateStyle} />
              <span style={{ fontSize: 12, color: TEXT_MID }}>s/d</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={dateStyle} />
            </>
          )}
        </div>
      </Card>

      <div className="rg-4">
        <StatCard
          icon={Users}
          label="Total Prospek"
          value={totalLeads}
          trend={trendOf(leadsThisMonth, s.leads_prev_month || 0)}
          sub={`${leadsThisMonth} bulan ini`}
        />
        <StatCard
          icon={Handshake}
          label="Total Deal"
          value={dealCount}
          trend={trendOf(dealsThisMonth, s.deals_prev_month || 0)}
          sub={`${dealsThisMonth} bulan ini`}
        />
        <StatCard icon={TrendingUp} label="Closing Rate" value={`${closingRate.toFixed(1)}%`} sub={`${apptToDeal.toFixed(0)}% dari appointment`} />
        <StatCard icon={Home} label="Unit Tersedia" value={unitsAvailable} sub={unitsTotal ? `dari ${unitsTotal} unit` : "belum ada unit"} />
      </div>

      <div className="chart-row">
        <Card>
          <SectionTitle title="Prospek Masuk" action={<span style={{ fontSize: 12, color: TEXT_MID }}>7 hari terakhir</span>} />
          <BarChart data={weekData} highlightIndex={highlightIndex} />
        </Card>
        <Card>
          <SectionTitle title="Sebaran Status Prospek" />
          <DonutChart data={donutData} centerValue={totalLeads} centerLabel="prospek" />
        </Card>
      </div>

      <Card>
        <SectionTitle title="Rata-rata Durasi per Tahap KPR" action={<span style={{ fontSize: 12, color: TEXT_MID }}>dalam hari</span>} />
        <div className="rg-4">
          {stageDurations.map((s) => (
            <div key={s.label} style={{ padding: "14px 16px", background: PRIMARY_SOFT, borderRadius: 14 }}>
              <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {s.value != null ? `${s.value.toFixed(0)}` : "-"}
                {s.value != null && <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_MID }}> hari</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="chart-row">
        <Card>
          <SectionTitle
            title="Konsumen Sedang Mengumpulkan Berkas"
            action={<span style={{ fontSize: 12, color: TEXT_MID }}>{berkasRecap.length} konsumen berjalan</span>}
          />
          <DataTable
            emptyLabel="Tidak ada konsumen yang sedang dalam proses berkas."
            columns={[
              { key: "name", label: "Konsumen" },
              { key: "progres", label: "Progres Berkas", render: (r) => r.progres || "-" },
              { key: "bank", label: "Bank", render: (r) => r.bank || "-" },
              {
                key: "masuk_bank",
                label: "Masuk Bank",
                render: (r) => (r.masuk_bank ? new Date(`${r.masuk_bank}T00:00:00`).toLocaleDateString("id-ID") : "-"),
              },
              {
                key: "lama_hari",
                label: "Lama",
                render: (r) =>
                  r.lama_hari == null ? (
                    "-"
                  ) : (
                    // Anything sitting past 60 days at the bank is the thing a
                    // supervisor actually wants to spot on this screen.
                    <span style={{ fontWeight: 600, color: r.lama_hari > 60 ? "#c25b5b" : r.lama_hari > 30 ? "#b07d2b" : PRIMARY }}>
                      {r.lama_hari} hari
                    </span>
                  ),
              },
            ]}
            rows={berkasRecap}
          />
        </Card>

        <Card>
          <SectionTitle title="Progres Berkas" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {berkasSummary.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data berkas.</div>}
            {berkasSummary.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <FolderCheck size={15} color={PRIMARY} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, color: TEXT_MID }}>{b.label}</span>
                <span style={{ fontWeight: 700 }}>{b.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="Jumlah Sumber Leads"
          action={<span style={{ fontSize: 12, color: TEXT_MID }}>{totalLeads} prospek pada periode ini</span>}
        />
        {sourceRows.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data sumber leads.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {sourceRows.map((x) => (
            <div key={x.source}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{x.source}</span>
                <span style={{ color: TEXT_MID }}>
                  <b style={{ color: "inherit" }}>{x.leads}</b> leads · {x.deals} deal · {x.rate}
                </span>
              </div>
              <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 9, overflow: "hidden" }}>
                <div style={{ background: PRIMARY, height: "100%", width: `${(x.leads / maxSource) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="rg-2">
        <Card>
          <SectionTitle title="Pembayaran Terbaru" />
          {payments.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada pembayaran.</div>}
          {payments.map((p, i) => (
            <ListRow
              key={p.id}
              icon={Wallet}
              title={p.customers?.name || "Konsumen"}
              meta={`${String(p.payment_type).replace("_", " ")} · ${new Date(p.payment_date).toLocaleDateString("id-ID")}`}
              trailing={`Rp${Number(p.amount).toLocaleString("id-ID")}`}
              trailingMuted={p.status !== "terverifikasi"}
              last={i === payments.length - 1}
            />
          ))}
        </Card>

        <Card>
          <SectionTitle title="Komplain Terbaru" />
          {complaints.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada komplain.</div>}
          {complaints.map((c, i) => (
            <ListRow
              key={c.id}
              icon={MessageSquareWarning}
              title={c.category || c.description}
              meta={`${c.customers?.name || c.units?.unit_code || "Umum"} · ${c.status}`}
              trailing={c.priority}
              trailingMuted
              last={i === complaints.length - 1}
            />
          ))}
        </Card>
      </div>

      <div className="rg-2">
        <Card>
          <SectionTitle title="Performa per Agen" />
          <DataTable
            emptyLabel="Belum ada data agen."
            columns={[
              { key: "name", label: "Agen" },
              { key: "leads", label: "Prospek" },
              { key: "deals", label: "Deal" },
              {
                key: "rate",
                label: "Closing Rate",
                render: (row) => (row.leads ? `${((row.deals / row.leads) * 100).toFixed(0)}%` : "-"),
              },
            ]}
            rows={perAgent}
          />
        </Card>
        <Card>
          <SectionTitle title="Konversi Sumber Leads → Deal" />
          <DataTable
            emptyLabel="Belum ada data sumber leads."
            columns={[
              { key: "source", label: "Sumber" },
              { key: "leads", label: "Leads" },
              { key: "deals", label: "Deal" },
              { key: "rate", label: "Konversi" },
            ]}
            rows={sourceRows}
          />
        </Card>
      </div>
    </div>
  );
}

const dateStyle = {
  padding: "7px 10px",
  border: `1px solid ${BORDER}`,
  borderRadius: 999,
  fontSize: 12,
  outline: "none",
};
