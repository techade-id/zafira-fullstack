import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { Card, PageTitle, PrimaryButton, DataTable, TEXT_MID, ORANGE, ORANGE_DARK } from "../components/ui";

function groupCount(rows, key) {
  const map = {};
  for (const r of rows) {
    const k = r[key] || "-";
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

export default function LaporanPage() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [fieldProjects, setFieldProjects] = useState([]);
  const [complaints, setComplaints] = useState([]);

  async function fetchAll() {
    setLoading(true);
    // Paged, not a plain select: a report/export that silently stops at the
    // API's 1000-row ceiling is worse than one that errors.
    const [{ data: ld }, { data: cs }, { data: pm }, { data: fp }, { data: cp }] = await Promise.all([
      fetchAllRows(() => supabase.from("leads").select("name, phone, source, status, created_at")),
      fetchAllRows(() => supabase.from("customers").select("name, phone, status, process_started_at, process_completed_at")),
      fetchAllRows(() => supabase.from("payments").select("payment_type, amount, status, payment_date")),
      fetchAllRows(() => supabase.from("field_projects").select("status, progress_percent, start_date, target_end_date, units(unit_code)")),
      fetchAllRows(() => supabase.from("complaints").select("category, priority, status, created_at")),
    ]);
    setLeads(ld || []);
    setCustomers(cs || []);
    setPayments(pm || []);
    setFieldProjects(fp || []);
    setComplaints(cp || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  const totalRevenue = payments.filter((p) => p.status === "terverifikasi").reduce((sum, p) => sum + Number(p.amount), 0);
  const avgProgress = fieldProjects.length ? fieldProjects.reduce((s, f) => s + f.progress_percent, 0) / fieldProjects.length : 0;
  // "deal" is the current funnel stage; "closing" is the pre-migration name.
  const closingCount = leads.filter((l) => l.status === "deal" || l.status === "closing").length;

  const statCards = [
    { label: "Total Prospek", value: leads.length },
    { label: "Closing", value: closingCount },
    { label: "Pendapatan Terverifikasi", value: `Rp${totalRevenue.toLocaleString("id-ID")}` },
    { label: "Rata-rata Progres Proyek", value: `${avgProgress.toFixed(0)}%` },
  ];

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leads), "Prospek");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customers), "Konsumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payments), "Pembayaran");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(fieldProjects.map((f) => ({ unit: f.units?.unit_code, status: f.status, progress_percent: f.progress_percent, start_date: f.start_date, target_end_date: f.target_end_date }))),
      "Monitoring Lapangan"
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(complaints), "Komplain");
    XLSX.writeFile(wb, `laporan-griya-zafira-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <PageTitle
        title="Laporan"
        subtitle="Ringkasan sales, customer, closing, dan progres proyek"
        action={<PrimaryButton onClick={exportExcel}>Export ke Excel</PrimaryButton>}
      />

      <div className="rg-4" style={{ marginBottom: 22 }}>
        {statCards.map((c) => (
          <Card key={c.label} style={{ borderTop: `4px solid ${ORANGE}` }}>
            <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 10 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: ORANGE_DARK }}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="rg-2">
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Prospek per Status</div>
          <DataTable loading={loading} columns={[{ key: "label", label: "Status" }, { key: "value", label: "Jumlah" }]} rows={groupCount(leads, "status")} />
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Konsumen per Status</div>
          <DataTable loading={loading} columns={[{ key: "label", label: "Status" }, { key: "value", label: "Jumlah" }]} rows={groupCount(customers, "status")} />
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Progres Proyek per Status</div>
          <DataTable loading={loading} columns={[{ key: "label", label: "Status" }, { key: "value", label: "Jumlah Unit" }]} rows={groupCount(fieldProjects, "status")} />
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Komplain per Status</div>
          <DataTable loading={loading} columns={[{ key: "label", label: "Status" }, { key: "value", label: "Jumlah" }]} rows={groupCount(complaints, "status")} />
        </Card>
      </div>
    </div>
  );
}
