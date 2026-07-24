import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Card, PageTitle, PrimaryButton, DataTable, Badge, BORDER, TEXT_MID } from "../components/ui";

const ROLE_OPTIONS = ["admin", "manager", "sales_agent", "tim_lapangan"];

export default function DataAgenPage() {
  const { profile } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // transfer state
  const [customers, setCustomers] = useState([]);
  const [transfer, setTransfer] = useState({ customer_id: "", to_agent_id: "", reason: "" });
  const [transferring, setTransferring] = useState(false);
  const [transfers, setTransfers] = useState([]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: a }, { data: c }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("customers").select("id, name, sales_agent_id").order("name"),
      supabase
        .from("customer_transfers")
        .select("*, customers(name), from_agent:profiles!customer_transfers_from_agent_id_fkey(full_name), to_agent:profiles!customer_transfers_to_agent_id_fkey(full_name)")
        .order("transferred_at", { ascending: false })
        .limit(20),
    ]);
    setAgents(a || []);
    setCustomers(c || []);
    setTransfers(t || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function updateAgent(id, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) setError(error.message);
    fetchAll();
  }

  async function handleTransfer() {
    if (!transfer.customer_id || !transfer.to_agent_id) {
      setError("Pilih konsumen dan agen tujuan.");
      return;
    }
    setTransferring(true);
    setError("");
    const cust = customers.find((c) => c.id === transfer.customer_id);
    const fromAgent = cust?.sales_agent_id || null;
    const { error: e1 } = await supabase.from("customers").update({ sales_agent_id: transfer.to_agent_id }).eq("id", transfer.customer_id);
    if (!e1) {
      await supabase.from("customer_transfers").insert({
        customer_id: transfer.customer_id,
        from_agent_id: fromAgent,
        to_agent_id: transfer.to_agent_id,
        reason: transfer.reason.trim() || null,
        transferred_by: profile?.id || null,
      });
    }
    setTransferring(false);
    if (e1) {
      setError(e1.message);
      return;
    }
    setTransfer({ customer_id: "", to_agent_id: "", reason: "" });
    fetchAll();
  }

  return (
    <div>
      <PageTitle title="Data Agen" subtitle="Kelola detail agen dan pemindahan konsumen antar agen" />
      {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Daftar Agen</div>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada agen."
          columns={[
            { key: "full_name", label: "Nama" },
            {
              key: "role",
              label: "Role",
              render: (row) => (
                <select value={row.role} onChange={(e) => updateAgent(row.id, { role: e.target.value })} style={selectStyle}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r.replace("_", " ")}</option>
                  ))}
                </select>
              ),
            },
            {
              key: "divisi",
              label: "Divisi",
              render: (row) => (
                <input defaultValue={row.divisi || ""} onBlur={(e) => e.target.value !== (row.divisi || "") && updateAgent(row.id, { divisi: e.target.value || null })} style={cellInputStyle} placeholder="-" />
              ),
            },
            {
              key: "daerah",
              label: "Daerah",
              render: (row) => (
                <input defaultValue={row.daerah || ""} onBlur={(e) => e.target.value !== (row.daerah || "") && updateAgent(row.id, { daerah: e.target.value || null })} style={cellInputStyle} placeholder="-" />
              ),
            },
            {
              key: "is_active",
              label: "Status",
              render: (row) => (
                <button onClick={() => updateAgent(row.id, { is_active: !row.is_active })} style={{ border: "none", background: "none", cursor: "pointer" }}>
                  <Badge value={row.is_active ? "aktif" : "batal"} />
                </button>
              ),
            },
          ]}
          rows={agents}
        />
        <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 8 }}>Divisi/Daerah tersimpan otomatis saat keluar dari kolom. Klik status untuk mengaktifkan/menonaktifkan.</div>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Perpindahan Konsumen Antar Agen</div>
        <div className="transfer-form-grid">
          <select value={transfer.customer_id} onChange={(e) => setTransfer({ ...transfer, customer_id: e.target.value })} style={selectStyle}>
            <option value="">Pilih Konsumen</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={transfer.to_agent_id} onChange={(e) => setTransfer({ ...transfer, to_agent_id: e.target.value })} style={selectStyle}>
            <option value="">Agen Tujuan</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
          <input placeholder="Alasan (opsional)" value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} style={selectStyle} />
          <PrimaryButton onClick={handleTransfer} disabled={transferring}>
            {transferring ? "..." : "Pindahkan"}
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Riwayat Perpindahan</div>
        <DataTable
          emptyLabel="Belum ada perpindahan konsumen."
          columns={[
            { key: "customer", label: "Konsumen", render: (row) => row.customers?.name || "-" },
            { key: "from", label: "Dari", render: (row) => row.from_agent?.full_name || "-" },
            { key: "to", label: "Ke", render: (row) => row.to_agent?.full_name || "-" },
            { key: "reason", label: "Alasan", render: (row) => row.reason || "-" },
            { key: "transferred_at", label: "Tanggal", render: (row) => new Date(row.transferred_at).toLocaleDateString("id-ID") },
          ]}
          rows={transfers}
        />
      </Card>
    </div>
  );
}

const selectStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
};

const cellInputStyle = {
  padding: "4px 8px",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 12,
  outline: "none",
  width: 100,
};
