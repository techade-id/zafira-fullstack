import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Wallet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { getSignedUrl } from "../lib/storage";
import { unggahBuktiTransfer, unggahKuitansi, dengarBerkas } from "../lib/berkas";
import ModalPembayaran from "../components/ModalPembayaran";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { rupiah, tanggal, labelJenisBayar, labelStatus } from "../lib/format";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER, DeleteButton, EditButton, RowActions, TEXT_MID, TEXT_DARK, ACCENT, ACCENT_DARK, NEGATIVE, ReadOnlyBanner } from "../components/ui";

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

    // Aturannya (bucket, status, trigger guard_payment_verification) ada di
    // lib/berkas.js — dipakai bersama dengan tahap KPR dan Dokumen Konsumen.
    const { error: gagal } = await unggahBuktiTransfer(row, file);
    setBusy(false);
    if (gagal) {
      setError(gagal);
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

    const { error: gagal } = await unggahKuitansi(row, file);
    setBusy(false);
    if (gagal) {
      setError(gagal);
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
  const [params, setParams] = useSearchParams();
  const canVerify = canWrite(profile, "payment_verify");
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  // null = tertutup, { pembayaran: null } = catat baru, { pembayaran } = ubah.
  const [formulir, setFormulir] = useState(null);

  async function fetchData() {
    setLoading(true);
    const { data: pay } = await fetchAllRows(() => supabase.from("payments").select("*, customers(name)").order("payment_date", { ascending: false }));
    setPayments(pay || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    // Pembayaran juga dicatat dari halaman konsumen dan Progres KPR; daftar ini
    // ikut segar dari mana pun perubahannya datang.
    return dengarBerkas(null, fetchData);
  }, []);

  /** Sorot baris yang baru disimpan — DataTable membawa ke halamannya. */
  function sorot(id) {
    if (!id) return;
    const p = new URLSearchParams(params);
    p.set("sorot", id);
    setParams(p, { replace: true });
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
        action={<PrimaryButton subject="payment" onClick={() => setFormulir({ pembayaran: null })}>+ Catat Pembayaran</PrimaryButton>}
      />

      <ReadOnlyBanner />

      {!canVerify && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>
          Pemisahan wewenang: pembayaran dan bukti transfernya boleh dicatat di sini, tetapi verifikasi dan kuitansi resmi
          adalah wewenang Finance. Mengunggah bukti transfer memindahkan pembayaran ke antrean verifikasi mereka.
        </div>
      )}

      <ModalPembayaran
        open={Boolean(formulir)}
        pembayaran={formulir?.pembayaran || null}
        jenisAwal="booking"
        onClose={() => setFormulir(null)}
        onSaved={sorot}
      />

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
                  {(row.status !== "terverifikasi" || canVerify) && <EditButton subject="payment" onClick={() => setFormulir({ pembayaran: row })} />}
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

