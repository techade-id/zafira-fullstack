import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, DeleteButton, EditButton, RowActions, TEXT_MID } from "../components/ui";

export default function PembatalanPage() {
  const [cancellations, setCancellations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { customer_id: "", reason: "", detail: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(row) {
    setForm({ customer_id: row.customer_id || "", reason: row.reason || "", detail: row.detail || "" });
    setEditingId(row.id);
    setShowForm(true);
    setError("");
  }
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
    // Creating goes through the RPC so the cancellation and the customer's
    // status change land in one transaction. Editing only touches the
    // cancellation row, so a plain update is correct there.
    const { error } = editingId
      ? await supabase
          .from("cancellations")
          .update({ customer_id: form.customer_id, reason: form.reason.trim(), detail: form.detail.trim() || null })
          .eq("id", editingId)
      : (
          await supabase.rpc("cancel_customer", {
            p_customer_id: form.customer_id,
            p_reason: form.reason.trim(),
            p_detail: form.detail.trim() || null,
          })
        );
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    resetForm();
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton onClick={handleAddCancellation} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Pembatalan"}
            </PrimaryButton>
            {editingId && (
              <button onClick={resetForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Batal
              </button>
            )}
          </div>
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
                <RowActions>
                  <EditButton onClick={() => startEdit(row)} />
                  <DeleteButton
                    itemName={`Pembatalan ${row.customers?.name || ""}`.trim()}
                    warning="Status konsumen tidak otomatis kembali aktif. Ubah manual di halaman Konsumen bila perlu."
                    onDelete={() => supabase.from("cancellations").delete().eq("id", row.id)}
                    onDone={fetchData}
                  />
                </RowActions>
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
