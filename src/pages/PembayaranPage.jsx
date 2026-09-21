import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Wallet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { rupiah, tanggal, labelJenisBayar, labelStatus } from "../lib/format";
import InputRupiah from "../components/InputRupiah";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER, DeleteButton, EditButton, RowActions, TEXT_MID, TEXT_DARK, ACCENT, ACCENT_DARK, NEGATIVE, ReadOnlyBanner, inputStyle } from "../components/ui";

const PAYMENT_TYPES = ["booking", "dp", "dana_talangan", "termin", "pelunasan", "lainnya"];

/**
 * Unggah bukti transfer — dan dengan itu, minta verifikasi Finance.
 *
 * BRIEF §Leads: "Tambahkan Section Upload Bukti Pembayaran" dan "Tambahkan Fase
 * Menunggu verifikasi sebelum di Konfirmasi oleh finance … termasuk Booking,
 * misalnya kwitansi harus masuk ke tahap verifikasi ke Finance untuk
 * memvalidasi."
 *
 * Bukti transfer datang dari konsumen dan diunggah Admin Marketing; kuitansi
 * resmi ditandatangani perusahaan dan hanya boleh datang dari Finance. Fase di
 * antara keduanya — "menunggu verifikasi" — sebelumnya tidak ada, sehingga
 * Finance tidak punya cara membedakan pembayaran yang buktinya sudah lengkap
 * dari yang baru sekadar dicatat.
 */
function UnggahBukti({ row, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");

    const { path, error: upErr } = await uploadFile("payment-proofs", row.customer_id, file);
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }

    // Status dan bukti dikirim bersama: trigger guard_payment_verification
    // hanya mengizinkan perpindahan ke 'menunggu_verifikasi' bila buktinya ikut
    // dalam baris yang sama.
    const { error: dbErr } = await supabase
      .from("payments")
      .update({ bukti_transfer_url: path, status: "menunggu_verifikasi" })
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
          border: `1px solid ${BORDER}`,
          background: "#fff",
          color: TEXT_DARK,
          borderRadius: 9,
          padding: "5px 11px",
          fontSize: 11,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
        title="Unggah bukti transfer dari konsumen dan kirim ke antrean verifikasi Finance"
      >
        {busy ? "Mengunggah…" : row.bukti_transfer_url ? "Ganti Bukti" : "+ Bukti Transfer"}
        <input type="file" accept="image/*,application/pdf" onChange={handlePick} disabled={busy} style={{ display: "none" }} />
      </label>
      {error && <div style={{ fontSize: 11, color: NEGATIVE, marginTop: 4, whiteSpace: "normal", maxWidth: 200 }}>{error}</div>}
    </div>
  );
}

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
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
      toast.gagal(`Gagal menyimpan: ${error.message}`);
      return;
    }
    toast.sukses(editingId ? "Perubahan tersimpan." : `${labelJenisBayar(payload.payment_type)} ${rupiah(payload.amount)} masuk antrean verifikasi.`);
    resetForm();
    fetchData();
    segarkanNotifikasi();
  }

  async function viewReceipt(path) {
    const url = await getSignedUrl("payment-receipts", path);
    if (url) window.open(url, "_blank");
  }

  async function viewProof(path) {
    const url = await getSignedUrl("payment-proofs", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <PageTitle
        title="Riwayat Pembayaran"
        subtitle="Monitoring penagihan — setiap pembayaran melewati bukti transfer, lalu verifikasi Finance"
        action={<PrimaryButton subject="payment" onClick={() => setShowForm((v) => !v)}>+ Catat Pembayaran</PrimaryButton>}
      />

      <ReadOnlyBanner />

      {!canVerify && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>
          Pemisahan wewenang: pembayaran dan bukti transfernya boleh dicatat di sini, tetapi verifikasi dan kuitansi resmi
          adalah wewenang Finance. Mengunggah bukti transfer memindahkan pembayaran ke antrean verifikasi mereka.
        </div>
      )}

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-4" style={{ marginBottom: 14, rowGap: 14 }}>
            <Bidang label="Konsumen" wajib>
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
                <option value="">— pilih —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Bidang>
            <Bidang label="Jenis Pembayaran">
              <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} style={inputStyle}>
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelJenisBayar(t)}
                  </option>
                ))}
              </select>
            </Bidang>
            <Bidang label="Nominal" wajib>
              {/* Singkatan, pilihan cepat, dan terbilang — BRIEF §Leads
                  mengeluhkan nominal yang harus diketik satu digit per kali. */}
              <InputRupiah
                value={form.amount}
                onChange={(v) => setForm({ ...form, amount: v })}
                pilihanCepat={form.payment_type === "booking" ? [3e6, 5e6, 7e6, 10e6] : undefined}
              />
            </Bidang>
            <Bidang label="Tanggal Pembayaran">
              <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} style={inputStyle} />
            </Bidang>
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
          sortable
          searchable
          searchPlaceholder="Cari konsumen…"
          searchExtra={(row) => row.customers?.name || ""}
          pageSize={25}
          defaultSort={{ key: "payment_date", arah: "desc" }}
          // Lonceng menautkan langsung ke baris pembayaran yang menunggu.
          highlightId={params.get("sorot") || undefined}
          emptyIcon={Wallet}
          emptyLabel="Belum ada riwayat pembayaran"
          emptyHint="Booking fee dari konversi prospek akan otomatis muncul di sini sebagai antrean verifikasi."
          // Finance membuka halaman ini untuk satu hal: menemukan yang belum
          // diverifikasi. Sebelum ini, satu-satunya caranya adalah memelototi
          // seluruh daftar.
          filters={[
            {
              key: "status",
              label: "Semua status",
              options: [
                { value: "menunggu", label: "Bukti transfer belum ada" },
                { value: "menunggu_verifikasi", label: "Menunggu verifikasi Finance" },
                { value: "terverifikasi", label: "Terverifikasi" },
              ],
            },
            {
              key: "payment_type",
              label: "Semua jenis",
              options: PAYMENT_TYPES.map((t) => ({ value: t, label: labelJenisBayar(t) })),
            },
          ]}
          onRowClick={(row) => row.customer_id && navigate(`/konsumen/${row.customer_id}`)}
          columns={[
            { key: "customer", label: "Konsumen", sortValue: (row) => row.customers?.name, render: (row) => row.customers?.name || "-" },
            { key: "payment_type", label: "Jenis", render: (row) => labelJenisBayar(row.payment_type) },
            { key: "amount", label: "Nominal", align: "right", sortValue: (row) => Number(row.amount), render: (row) => rupiah(row.amount) },
            { key: "payment_date", label: "Tanggal", render: (row) => tanggal(row.payment_date) },
            {
              key: "status",
              label: "Status",
              sortable: false,
              render: (row) => {
                if (row.status === "terverifikasi") return <Badge value={row.status} />;
                if (canVerify)
                  return (
                    <VerifyWithReceipt
                      row={row}
                      onDone={() => {
                        fetchData();
                        segarkanNotifikasi();
                        toast.sukses("Pembayaran terverifikasi dan kuitansi tersimpan.");
                      }}
                    />
                  );
                // Dua keadaan yang berbeda artinya bagi orang yang bukan
                // Finance: satu masih pekerjaannya, satu lagi sudah bukan.
                return (
                  <span
                    style={{ fontSize: 11.5, fontWeight: 600, color: row.status === "menunggu_verifikasi" ? ACCENT_DARK : TEXT_MID }}
                    title={
                      row.status === "menunggu_verifikasi"
                        ? "Bukti transfer sudah dikirim — menunggu verifikasi pembayaran dari Finance"
                        : "Unggah bukti transfer untuk mengirimnya ke antrean Finance"
                    }
                  >
                    {labelStatus(row.status)}
                  </span>
                );
              },
            },
            {
              key: "bukti_transfer_url",
              label: "Bukti Transfer",
              sortable: false,
              // BRIEF §Leads: "Tambahkan Section Upload Bukti Pembayaran".
              render: (row) => (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {row.bukti_transfer_url && (
                    <button
                      onClick={() => viewProof(row.bukti_transfer_url)}
                      style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      Lihat
                    </button>
                  )}
                  {row.status !== "terverifikasi" && canWrite(profile, "payment") && (
                    <UnggahBukti
                      row={row}
                      onDone={() => {
                        fetchData();
                        segarkanNotifikasi();
                        toast.sukses("Bukti transfer terkirim — menunggu verifikasi pembayaran dari Finance.");
                      }}
                    />
                  )}
                  {!row.bukti_transfer_url && row.status === "terverifikasi" && <span style={{ color: TEXT_MID, fontSize: 12 }}>-</span>}
                </div>
              ),
            },
            {
              key: "proof_url",
              label: "Kuitansi",
              sortable: false,
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
              sortable: false,
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

/** Label sungguhan di atas kontrol — placeholder hilang begitu orang mengetik. */
function Bidang({ label, wajib, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
        {label}
        {wajib && <span style={{ color: ACCENT_DARK }} aria-hidden="true"> *</span>}
      </label>
      {children}
    </div>
  );
}
