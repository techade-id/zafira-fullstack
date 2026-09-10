import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER, DeleteButton, EditButton, RowActions, TEXT_MID, ACCENT, ACCENT_DARK, NEGATIVE, ReadOnlyBanner } from "../components/ui";

const PAYMENT_TYPES = ["booking", "dp", "dana_talangan", "termin", "pelunasan", "lainnya"];

/**
 * Finance-only verification (PRD §3.2, REVISI §2.2).
 *
 * Verifying means attaching the official receipt, so the file picker *is* the
 * verify action — there is no way to mark a payment settled without one. For a
 * Booking Fee this is what fires the Handover Hard-Lock in the database.
 */
function VerifyWithReceipt({ row, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");

    const { path, error: upErr } = await uploadFile("payment-receipts", row.customer_id, file);
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }

    const { error: dbErr } = await supabase
      .from("payments")
      .update({ status: "terverifikasi", proof_url: path })
      .eq("id", row.id);

    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    onDone();
  }

  return (
    <div>
      <label
        style={{
          display: "inline-block",
          border: `1px solid ${ACCENT}`,
          background: "#fff",
          color: ACCENT_DARK,
          borderRadius: 9,
          padding: "5px 11px",
          fontSize: 11,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
        title="Unggah kuitansi resmi untuk memverifikasi pembayaran ini"
      >
        {busy ? "Mengunggah…" : "Verifikasi + Kuitansi"}
        <input type="file" onChange={handlePick} disabled={busy} style={{ display: "none" }} />
      </label>
      {error && <div style={{ fontSize: 11, color: NEGATIVE, marginTop: 4, whiteSpace: "normal", maxWidth: 200 }}>{error}</div>}
    </div>
  );
}

export default function PembayaranPage() {
  const { profile } = useAuth();
  const canVerify = canWrite(profile, "payment_verify");
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

  async function viewReceipt(path) {
    const url = await getSignedUrl("payment-receipts", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <PageTitle
        title="Riwayat Pembayaran"
        subtitle="Monitoring penagihan — booking, DP, dana talangan, termin, pelunasan"
        action={<PrimaryButton subject="payment" onClick={() => setShowForm((v) => !v)}>+ Catat Pembayaran</PrimaryButton>}
      />

      <ReadOnlyBanner />

      {!canVerify && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>
          Pemisahan wewenang: pembayaran boleh dicatat di sini, tetapi verifikasi dan unggah kuitansi resmi adalah wewenang Finance.
        </div>
      )}

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
          {error && <div style={{ color: "#C2413B", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton subject="payment" onClick={handleAddPayment} disabled={saving}>
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
              render: (row) => {
                if (row.status === "terverifikasi") return <Badge value={row.status} />;
                if (canVerify) return <VerifyWithReceipt row={row} onDone={fetchData} />;
                return <Badge value="menunggu" />;
              },
            },
            {
              key: "proof_url",
              label: "Kuitansi",
              render: (row) =>
                row.proof_url ? (
                  <button
                    onClick={() => viewReceipt(row.proof_url)}
                    style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    Lihat
                  </button>
                ) : (
                  <span style={{ color: TEXT_MID, fontSize: 12 }}>-</span>
                ),
            },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <RowActions>
                  {/* A verified payment is an accounting record — editing it is
                      Finance's call, not the agent who first keyed it in. */}
                  {(row.status !== "terverifikasi" || canVerify) && <EditButton subject="payment" onClick={() => startEdit(row)} />}
                  <DeleteButton
                    subject="payment_delete"
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
