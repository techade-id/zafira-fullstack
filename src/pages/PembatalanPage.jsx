import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, DeleteButton } from "../components/ui";

export default function PembatalanPage() {
  const [cancellations, setCancellations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: "", reason: "", detail: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cancelReasons = useBusinessSettings("cancel_reason");

  async function fetchData() {
    setLoading(true);
    const [{ data: cancel }, { data: cust }] = await Promise.all([
      supabase.from("cancellations").select("*, customers(name), profiles(full_name)").order("cancelled_at", { ascending: false }),
      supabase.from("customers").select("id, name").neq("status", "batal").order("name"),
    ]);
    setCancellations(cancel || []);
    setCustomers(cust || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAddCancellation() {
    if (!form.customer_id || !form.reason.trim()) {
      setError("Konsumen dan alasan wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    // One RPC = one transaction. Doing the insert and the customer status
    // update as two calls could leave a cancellation against a live customer.
    const { error } = await supabase.rpc("cancel_customer", {
      p_customer_id: form.customer_id,
      p_reason: form.reason.trim(),
      p_detail: form.detail.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ customer_id: "", reason: "", detail: "" });
    setShowForm(false);
    fetchData();
  }

  return (
    <div>
      <PageTitle
        title="Pembatalan"
        subtitle={`${cancellations.length} riwayat pembatalan`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Catat Pembatalan</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-2" style={{ marginBottom: 12 }}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
              <option value="">Pilih Konsumen</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={inputStyle}>
              <option value="">Alasan Pembatalan</option>
              {withCurrentValue(cancelReasons, form.reason).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <textarea
              placeholder="Detail tambahan (opsional)"
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddCancellation} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Pembatalan"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada riwayat pembatalan."
          columns={[
            { key: "customer", label: "Konsumen", render: (row) => row.customers?.name || "-" },
            { key: "reason", label: "Alasan" },
            { key: "detail", label: "Detail", render: (row) => row.detail || "-" },
            { key: "cancelled_by", label: "Diproses Oleh", render: (row) => row.profiles?.full_name || "-" },
            { key: "cancelled_at", label: "Tanggal", render: (row) => new Date(row.cancelled_at).toLocaleDateString("id-ID") },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <DeleteButton
                  itemName={`Pembatalan ${row.customers?.name || ""}`.trim()}
                  warning="Status konsumen tidak otomatis kembali aktif. Ubah manual di halaman Konsumen bila perlu."
                  onDelete={() => supabase.from("cancellations").delete().eq("id", row.id)}
                  onDone={fetchData}
                />
              ),
            },
          ]}
          rows={cancellations}
        />
      </Card>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
};
