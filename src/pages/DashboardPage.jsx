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
import { Users, Handshake, TrendingUp, Home, Wallet, MessageSquareWarning } from "lucide-react";

const DEAL_STATUSES = ["deal", "closing"];
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function avg(nums) {
  const valid = nums.filter((n) => n != null && !isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function days(a, b) {
  if (!a || !b) return null;
  return (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Percent change of `current` vs `previous`, or null when there's no baseline. */
function trendOf(current, previous) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  return { up: pct >= 0, label: `${Math.abs(pct).toFixed(0)}%` };
}

export default function DashboardPage() {
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [kpr, setKpr] = useState([]);
  const [agents, setAgents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [unitsAvailable, setUnitsAvailable] = useState(0);
  const [unitsTotal, setUnitsTotal] = useState(0);

  useEffect(() => {
    async function load() {
      const [{ data: ld }, { data: cs }, { data: kp }, { data: ag }, { data: pm }, { data: cp }, unitsAvail, unitsAll] =
        await Promise.all([
          supabase.from("leads").select("id, status, source, assigned_to, created_at"),
          supabase.from("customers").select("id, status"),
          supabase.from("customer_kpr").select("*"),
          supabase.from("profiles").select("id, full_name"),
          supabase.from("payments").select("id, amount, payment_type, payment_date, status, customers(name)").order("payment_date", { ascending: false }).limit(4),
          supabase.from("complaints").select("id, category, description, priority, status, created_at, customers(name), units(unit_code)").order("created_at", { ascending: false }).limit(4),
          supabase.from("units").select("id", { count: "exact", head: true }).eq("status", "tersedia"),
          supabase.from("units").select("id", { count: "exact", head: true }),
        ]);
      setLeads(ld || []);
      setCustomers(cs || []);
      setKpr(kp || []);
      setAgents(ag || []);
      setPayments(pm || []);
      setComplaints(cp || []);
      setUnitsAvailable(unitsAvail.count || 0);
      setUnitsTotal(unitsAll.count || 0);
    }
    load();
  }, []);

  const totalLeads = leads.length;
  const dealLeads = leads.filter((l) => DEAL_STATUSES.includes(l.status));
  const dealCount = dealLeads.length;
  const appointmentCount = leads.filter((l) => l.status === "appointment").length;
  const closingRate = totalLeads ? (dealCount / totalLeads) * 100 : 0;
  const apptToDeal = appointmentCount + dealCount ? (dealCount / (appointmentCount + dealCount)) * 100 : 0;

  // month-over-month, computed from real created_at values
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inRange = (d, from, to) => {
    const t = new Date(d);
    return t >= from && (!to || t < to);
  };
  const leadsThisMonth = leads.filter((l) => inRange(l.created_at, thisMonthStart)).length;
  const leadsLastMonth = leads.filter((l) => inRange(l.created_at, lastMonthStart, thisMonthStart)).length;
  const dealsThisMonth = dealLeads.filter((l) => inRange(l.created_at, thisMonthStart)).length;
  const dealsLastMonth = dealLeads.filter((l) => inRange(l.created_at, lastMonthStart, thisMonthStart)).length;

  // last 7 days of incoming leads
  const today = startOfDay(new Date());
  const weekData = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return {
      label: DAY_LABELS[day.getDay()],
      value: leads.filter((l) => {
        const t = new Date(l.created_at);
        return t >= day && t < next;
      }).length,
    };
  });

  // status distribution for the donut
  const statusCounts = {};
  for (const l of leads) {
    const s = l.status || "leads";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const donutData = Object.entries(statusCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const stageDurations = [
    { label: "Pengumpulan Berkas", value: avg(kpr.map((k) => days(k.tanggal_masuk_bank, k.tanggal_sp3k_terbit))) },
    { label: "SP3K → Akad", value: avg(kpr.map((k) => days(k.tanggal_sp3k_terbit, k.tanggal_akad))) },
    { label: "Persiapan Akad", value: avg(kpr.map((k) => days(k.tanggal_dp, k.tanggal_akad))) },
    { label: "Persiapan Serah Terima", value: avg(kpr.map((k) => days(k.tanggal_akad, k.tanggal_serah_terima_kunci))) },
  ];

  const perAgent = agents
    .map((a) => {
      const agentLeads = leads.filter((l) => l.assigned_to === a.id);
      return {
        name: a.full_name,
        leads: agentLeads.length,
        deals: agentLeads.filter((l) => DEAL_STATUSES.includes(l.status)).length,
      };
    })
    .filter((a) => a.leads > 0)
    .sort((a, b) => b.deals - a.deals);

  const sources = {};
  for (const l of leads) {
    const s = l.source || "Tidak diketahui";
    if (!sources[s]) sources[s] = { source: s, leads: 0, deals: 0 };
    sources[s].leads += 1;
    if (DEAL_STATUSES.includes(l.status)) sources[s].deals += 1;
  }
  const sourceRows = Object.values(sources)
    .map((s) => ({ ...s, rate: s.leads ? ((s.deals / s.leads) * 100).toFixed(1) + "%" : "-" }))
    .sort((a, b) => b.leads - a.leads);

  const maxWeek = Math.max(...weekData.map((d) => d.value));
  const highlightIndex = maxWeek > 0 ? weekData.findIndex((d) => d.value === maxWeek) : -1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rg-4">
        <StatCard
          icon={Users}
          label="Total Prospek"
          value={totalLeads}
          trend={trendOf(leadsThisMonth, leadsLastMonth)}
          sub={`${leadsThisMonth} bulan ini`}
        />
        <StatCard
          icon={Handshake}
          label="Total Deal"
          value={dealCount}
          trend={trendOf(dealsThisMonth, dealsLastMonth)}
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
