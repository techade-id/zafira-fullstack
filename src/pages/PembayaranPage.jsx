import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER, DeleteButton, EditButton, RowActions, TEXT_MID } from "../components/ui";

const PAYMENT_TYPES = ["booking", "dp", "dana_talangan", "termin", "pelunasan", "lainnya"];

export default function PembayaranPage() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { customer_id: "", payment_type: "booking", amount: "", payment_date: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(row) {
    setForm({
      customer_id: row.customer_id || "",
      payment_type: row.payment_type || "booking",
      amount: row.amount ?? "",
      payment_date: row.payment_date || "",
    });
    setEditingId(row.id);
    setShowForm(true);
    setError("");
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    const [{ data: pay }, { data: cust }] = await Promise.all([
      fetchAllRows(() => supabase.from("payments").select("*, customers(name)").order("payment_date", { ascending: false })),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setPayments(pay || []);
    setCustomers(cust || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAddPayment() {
    if (!form.customer_id || !form.amount) {
      setError("Konsumen dan nominal wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      customer_id: form.customer_id,
      payment_type: form.payment_type,
      amount: Number(form.amount),
      payment_date: form.payment_date || new Date().toISOString().slice(0, 10),
    };
    // Editing must not silently re-open a payment that was already verified.
    const { error } = editingId
      ? await supabase.from("payments").update(payload).eq("id", editingId)
      : await supabase.from("payments").insert({ ...payload, status: "menunggu" });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    resetForm();
    fetchData();
  }

  async function verifyPayment(id) {
    await supabase.from("payments").update({ status: "terverifikasi" }).eq("id", id);
    fetchData();
  }

  return (
    <div>
      <PageTitle
        title="Riwayat Pembayaran"
        subtitle="Monitoring penagihan — booking, DP, dana talangan, termin, pelunasan"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Catat Pembayaran</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-4" style={{ marginBottom: 12 }}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
              <option value="">Pilih Konsumen</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} style={inputStyle}>
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
            <input placeholder="Nominal (Rp)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
            <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton onClick={handleAddPayment} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Pembayaran"}
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
          emptyLabel="Belum ada riwayat pembayaran."
          columns={[
            { key: "customer", label: "Konsumen", render: (row) => row.customers?.name || "-" },
            { key: "payment_type", label: "Jenis", render: (row) => <span style={{ textTransform: "capitalize" }}>{row.payment_type.replace("_", " ")}</span> },
            { key: "amount", label: "Nominal", render: (row) => `Rp${Number(row.amount).toLocaleString("id-ID")}` },
            { key: "payment_date", label: "Tanggal", render: (row) => new Date(row.payment_date).toLocaleDateString("id-ID") },
            {
              key: "status",
              label: "Status",
              render: (row) =>
                row.status === "terverifikasi" ? (
                  <Badge value={row.status} />
                ) : (
                  <button
                    onClick={() => verifyPayment(row.id)}
                    style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 9, padding: "5px 11px", fontSize: 11, cursor: "pointer" }}
                  >
                    Verifikasi
                  </button>
                ),
            },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <RowActions>
                  <EditButton onClick={() => startEdit(row)} />
                  <DeleteButton
                    itemName={`${row.payment_type} ${row.customers?.name || ""}`.trim()}
                    onDelete={() => supabase.from("payments").delete().eq("id", row.id)}
                    onDone={fetchData}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={payments}
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
