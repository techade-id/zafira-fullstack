import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, canWrite, roleOf } from "../lib/permissions";
import { Card, PageTitle, PrimaryButton, DataTable, Badge, BORDER, TEXT_MID, ACCENT_DARK, NEGATIVE, ReadOnlyBanner } from "../components/ui";

export default function DataAgenPage() {
  const { profile } = useAuth();
  const canSetRole = canWrite(profile, "agent_role");
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // antrean persetujuan
  const [pendingRole, setPendingRole] = useState({});
  const [busy, setBusy] = useState("");

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

  // Akun yang belum pernah disetujui: terdaftar tetapi belum aktif.
  const pending = agents.filter((a) => a.is_active === false);

  async function updateAgent(id, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) setError(error.message);
    fetchAll();
  }

  /**
   * Persetujuan dan penonaktifan lewat RPC, bukan UPDATE langsung: peran dan
   * status aktif harus berubah dalam satu transaksi, dan keduanya wajib
   * meninggalkan jejak audit beserta alasannya.
   */
  async function approve(id) {
    const role = pendingRole[id] || "sales";
    setBusy(id);
    setError("");
    const { error: rpcError } = await supabase.rpc("approve_user", { p_user_id: id, p_role: role });
    setBusy("");
    if (rpcError) return setError(rpcError.message);
    fetchAll();
  }

  async function setActive(row, aktif) {
    setBusy(row.id);
    setError("");
    const { error: rpcError } = aktif
      ? await supabase.rpc("approve_user", { p_user_id: row.id, p_role: roleOf(row) || "sales" })
      : await supabase.rpc("deactivate_user", { p_user_id: row.id, p_reason: "Dinonaktifkan dari halaman Pengguna" });
    setBusy("");
    if (rpcError) return setError(rpcError.message);
    fetchAll();
  }

  async function handleTransfer() {
    if (!transfer.customer_id || !transfer.to_agent_id) {
      setError("Pilih konsumen dan agen tujuan.");
      return;
    }
    setTransferring(true);
    setError("");
    // One RPC = one transaction, so a customer can never be reassigned
    // without the matching audit row being written.
    const { error: transferError } = await supabase.rpc("transfer_customer", {
      p_customer_id: transfer.customer_id,
      p_to_agent_id: transfer.to_agent_id,
      p_reason: transfer.reason.trim() || null,
    });
    setTransferring(false);
    if (transferError) {
      setError(transferError.message);
      return;
    }
    setTransfer({ customer_id: "", to_agent_id: "", reason: "" });
    fetchAll();
  }

  return (
    <div>
      <PageTitle title="Pengguna & Agen" subtitle="Persetujuan akun, peran, detail agen, dan pemindahan konsumen" />

      <ReadOnlyBanner />
      {error && <div style={{ color: NEGATIVE, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {pending.length > 0 && (
        <Card style={{ marginBottom: 18, borderColor: "#F6CDB8" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            Menunggu Persetujuan <span style={{ color: ACCENT_DARK }}>({pending.length})</span>
          </div>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 12 }}>
            Akun ini sudah mendaftar tetapi belum dapat mengakses apa pun. Tetapkan perannya untuk mengaktifkan.
          </div>
          <DataTable
            emptyLabel="Tidak ada permintaan."
            columns={[
              { key: "full_name", label: "Nama" },
              { key: "created_at", label: "Mendaftar", render: (r) => new Date(r.created_at).toLocaleDateString("id-ID") },
              {
                key: "role",
                label: "Tetapkan Peran",
                render: (r) => (
                  <select
                    value={pendingRole[r.id] || "sales"}
                    onChange={(e) => setPendingRole((m) => ({ ...m, [r.id]: e.target.value }))}
                    style={selectStyle}
                    disabled={!canSetRole}
                    title={ROLE_DESCRIPTIONS[pendingRole[r.id] || "sales"] || ""}
                  >
                    {ROLES.map((x) => (
                      <option key={x} value={x}>{ROLE_LABELS[x]}</option>
                    ))}
                  </select>
                ),
              },
              {
                key: "aksi",
                label: "",
                render: (r) =>
                  canSetRole ? (
                    <PrimaryButton subject="agent_role" onClick={() => approve(r.id)} disabled={busy === r.id} style={{ padding: "8px 16px" }}>
                      {busy === r.id ? "..." : "Setujui"}
                    </PrimaryButton>
                  ) : (
                    <span style={{ fontSize: 11.5, color: TEXT_MID }}>Hanya admin</span>
                  ),
              },
            ]}
            rows={pending}
          />
        </Card>
      )}

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Daftar Pengguna</div>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada agen."
          columns={[
            {
              key: "full_name",
              label: "Nama",
              render: (row) => (
                <input
                  defaultValue={row.full_name || ""}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== row.full_name && updateAgent(row.id, { full_name: e.target.value.trim() })}
                  style={{ ...cellInputStyle, width: 150 }}
                />
              ),
            },
            {
              key: "phone",
              label: "Telepon",
              render: (row) => (
                <input
                  defaultValue={row.phone || ""}
                  onBlur={(e) => e.target.value !== (row.phone || "") && updateAgent(row.id, { phone: e.target.value || null })}
                  style={cellInputStyle}
                  placeholder="-"
                />
              ),
            },
            {
              key: "role",
              label: "Role",
              // Changing a role is admin-only, enforced by the
              // profiles_guard_privileged trigger as well as this.
              render: (row) =>
                canSetRole ? (
                  <select
                    value={roleOf(row)}
                    onChange={(e) => updateAgent(row.id, { role: e.target.value })}
                    style={selectStyle}
                    title={ROLE_DESCRIPTIONS[roleOf(row)] || ""}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: 12.5 }} title={ROLE_DESCRIPTIONS[roleOf(row)] || ""}>
                    {ROLE_LABELS[roleOf(row)] || row.role}
                  </span>
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
                <button
                  onClick={() => setActive(row, !row.is_active)}
                  disabled={busy === row.id}
                  title={row.is_active ? "Nonaktifkan pengguna" : "Aktifkan kembali"}
                  style={{ border: "none", background: "none", cursor: busy === row.id ? "default" : "pointer" }}
                >
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
            {/* Memindahkan konsumen ke akun nonaktif akan membuatnya tidak
                terpegang siapa pun, jadi hanya pengguna aktif yang ditawarkan. */}
            {agents.filter((a) => a.is_active).map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
          <input placeholder="Alasan (opsional)" value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} style={selectStyle} />
          <PrimaryButton subject="customer" onClick={handleTransfer} disabled={transferring}>
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
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
};

const cellInputStyle = {
  padding: "4px 8px",
  border: `1px solid ${BORDER}`,
  borderRadius: 9,
  fontSize: 12,
  outline: "none",
  width: 100,
};
