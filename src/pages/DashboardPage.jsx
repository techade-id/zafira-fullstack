import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, DataTable, TEXT_MID, ORANGE_DARK, ORANGE, ORANGE_LIGHT, ORANGE_PALE } from "../components/ui";
import { Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const DEAL_STATUSES = ["deal", "closing"];

function avg(nums) {
  const valid = nums.filter((n) => n != null && !isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function days(a, b) {
  if (!a || !b) return null;
  return (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24);
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [kpr, setKpr] = useState([]);
  const [agents, setAgents] = useState([]);
  const [unitsAvailable, setUnitsAvailable] = useState(0);
  const [complaintsActive, setComplaintsActive] = useState(0);

  useEffect(() => {
    async function load() {
      const [{ data: ld }, { data: cs }, { data: kp }, { data: ag }, units, complaints] = await Promise.all([
        supabase.from("leads").select("id, status, source, assigned_to"),
        supabase.from("customers").select("id, status"),
        supabase.from("customer_kpr").select("*"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("units").select("id", { count: "exact", head: true }).eq("status", "tersedia"),
        supabase.from("complaints").select("id", { count: "exact", head: true }).neq("status", "selesai"),
      ]);
      setLeads(ld || []);
      setCustomers(cs || []);
      setKpr(kp || []);
      setAgents(ag || []);
      setUnitsAvailable(units.count || 0);
      setComplaintsActive(complaints.count || 0);
    }
    load();
  }, []);

  const totalLeads = leads.length;
  const dealCount = leads.filter((l) => DEAL_STATUSES.includes(l.status)).length;
  const appointmentCount = leads.filter((l) => l.status === "appointment").length;
  const cancelCount = leads.filter((l) => l.status === "cancel").length;
  const closingRate = totalLeads ? (dealCount / totalLeads) * 100 : 0;
  const apptToDeal = appointmentCount + dealCount ? (dealCount / (appointmentCount + dealCount)) * 100 : 0;

  const cards = [
    { label: "Total Prospek", value: totalLeads },
    { label: "Total Deal", value: dealCount },
    { label: "Closing Rate", value: `${closingRate.toFixed(1)}%` },
    { label: "Appointment → Deal", value: `${apptToDeal.toFixed(1)}%` },
    { label: "Unit Tersedia", value: unitsAvailable },
    { label: "Total Gagal (Cancel)", value: cancelCount },
    { label: "Konsumen Aktif", value: customers.filter((c) => c.status !== "batal").length },
    { label: "Komplain Aktif", value: complaintsActive },
  ];

  // avg durations per KPR stage
  const stageDurations = [
    { label: "Pengumpulan Berkas", value: avg(kpr.map((k) => days(k.tanggal_masuk_bank, k.tanggal_sp3k_terbit))) },
    { label: "SP3K → Akad", value: avg(kpr.map((k) => days(k.tanggal_sp3k_terbit, k.tanggal_akad))) },
    { label: "Persiapan Akad", value: avg(kpr.map((k) => days(k.tanggal_dp, k.tanggal_akad))) },
    { label: "Persiapan Serah Terima", value: avg(kpr.map((k) => days(k.tanggal_akad, k.tanggal_serah_terima_kunci))) },
  ];

  // per agent
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

  // source conversion
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

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: `linear-gradient(135deg, ${ORANGE_LIGHT}, #fff)`,
          border: `1px solid ${ORANGE_PALE}`,
          padding: "18px 22px",
          borderRadius: 14,
          marginBottom: 22,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 12, background: ORANGE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Building2 size={22} />
        </div>
        <h1 style={{ fontSize: 19, margin: 0 }}>Selamat Datang, {profile?.full_name || "..."}</h1>
      </div>

      <div className="rg-4" style={{ marginBottom: 22 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ borderTop: `4px solid ${ORANGE}` }}>
            <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 10 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: ORANGE_DARK }}>{c.value}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Rata-rata Durasi per Tahap KPR (hari)</div>
        <div className="rg-4">
          {stageDurations.map((s) => (
            <div key={s.label} style={{ padding: "12px 14px", background: ORANGE_LIGHT, borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value != null ? `${s.value.toFixed(0)} hari` : "-"}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="rg-2">
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Performa per Agen</div>
          <DataTable
            emptyLabel="Belum ada data agen."
            columns={[
              { key: "name", label: "Agen" },
              { key: "leads", label: "Prospek" },
              { key: "deals", label: "Deal" },
              { key: "rate", label: "Closing Rate", render: (row) => (row.leads ? `${((row.deals / row.leads) * 100).toFixed(0)}%` : "-") },
            ]}
            rows={perAgent}
          />
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Konversi Sumber Leads → Deal</div>
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
