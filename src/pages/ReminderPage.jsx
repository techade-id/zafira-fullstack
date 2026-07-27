import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, DataTable, Badge, TEXT_MID, PRIMARY, NEGATIVE } from "../components/ui";

const WARNING = "#b07d2b";

function sisaHari(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function sisaLabel(n) {
  if (n < 0) return `Terlewat ${Math.abs(n)} hari`;
  if (n === 0) return "Hari ini";
  return `${n} hari lagi`;
}

function sisaColor(n) {
  if (n < 0) return NEGATIVE;
  if (n <= 2) return WARNING;
  return PRIMARY;
}

export default function ReminderPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*, profiles(full_name)")
      .not("tanggal_rencana", "is", null)
      .neq("status", "cancel")
      .order("tanggal_rencana");
    setLeads(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const withSisa = leads.map((l) => ({ ...l, _sisa: sisaHari(l.tanggal_rencana) }));
  const overdue = withSisa.filter((l) => l._sisa < 0).length;
  const todayCount = withSisa.filter((l) => l._sisa === 0).length;

  return (
    <div>
      <PageTitle title="Reminder — Rencana Selanjutnya" subtitle="Daftar prospek dengan rencana follow-up terjadwal" />

      <div className="rg-3" style={{ marginBottom: 18 }}>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Terlewat</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: NEGATIVE }}>{overdue}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Hari Ini</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: WARNING }}>{todayCount}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Total Terjadwal</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{leads.length}</div>
        </Card>
      </div>

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada rencana follow-up terjadwal."
          columns={[
            { key: "name", label: "Nama Prospek" },
            { key: "phone", label: "Telepon", render: (row) => row.phone || "-" },
            { key: "status", label: "Status", render: (row) => <Badge value={row.status} /> },
            { key: "kategori_rencana", label: "Kategori", render: (row) => row.kategori_rencana || "-" },
            { key: "rencana_selanjutnya", label: "Rencana", render: (row) => row.rencana_selanjutnya || "-" },
            { key: "tanggal_rencana", label: "Tanggal", render: (row) => new Date(row.tanggal_rencana).toLocaleDateString("id-ID") },
            { key: "agent", label: "Agen", render: (row) => row.profiles?.full_name || "-" },
            {
              key: "sisa",
              label: "Sisa Hari",
              render: (row) => <span style={{ color: sisaColor(row._sisa), fontWeight: 600 }}>{sisaLabel(row._sisa)}</span>,
            },
          ]}
          rows={withSisa}
        />
      </Card>
    </div>
  );
}
