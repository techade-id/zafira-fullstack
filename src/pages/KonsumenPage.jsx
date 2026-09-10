import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canEditCustomer, isLocked, lockReason } from "../lib/permissions";
import { durasiHari, telepon } from "../lib/format";
import KontakAksi from "../components/KontakAksi";
import {
  Card,
  PageTitle,
  PrimaryButton,
  DataTable,
  Badge,
  BORDER,
  TEXT_MID,
  ACCENT_DARK,
  DeleteButton,
  EditButton,
  RowActions,
  ReadOnlyBanner,
  inputStyle,
} from "../components/ui";

const CUSTOMER_STATUS_OPTIONS = ["proses", "aktif", "selesai", "batal"];

/**
 * Daftar konsumen.
 *
 * Seluruh isi kartu konsumen — progres KPR, dokumen, pembayaran, riwayat — kini
 * tinggal di `/konsumen/:id`. Sebelumnya semuanya mengembang di bawah tabel ini,
 * sehingga satu-satunya cara melihat seorang konsumen adalah menggulir, dan
 * tidak ada URL yang bisa dikirimkan ke rekan kerja.
 */
export default function KonsumenPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = { name: "", phone: "", email: "", username_sosmed: "", ktp_number: "", address: "", unit_id: "", lead_id: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(row) {
    setForm({
      name: row.name || "",
      phone: row.phone || "",
      email: row.email || "",
      username_sosmed: row.username_sosmed || "",
      ktp_number: row.ktp_number || "",
      address: row.address || "",
      unit_id: row.unit_id || "",
      lead_id: row.lead_id || "",
    });
    setEditingId(row.id);
    setShowForm(true);
    setError("");
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: cust }, { data: unt }, { data: ld }] = await Promise.all([
      fetchAllRows(() =>
        supabase.from("customers").select("*, units(unit_code), leads(status)").order("created_at", { ascending: false })
      ),
      supabase.from("units").select("id, unit_code, status").order("unit_code"),
      supabase.from("leads").select("id, name, phone").order("name"),
    ]);
    setCustomers(cust || []);
    setUnits(unt || []);
    setLeads(ld || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  // Hasil pencarian global menautkan ke `/konsumen/<id>`, tetapi tautan lama
  // yang memakai `?sorot=` tetap dihormati agar tidak mati begitu saja.
  useEffect(() => {
    const sorot = params.get("sorot");
    if (sorot) navigate(`/konsumen/${sorot}`, { replace: true });
  }, [params, navigate]);

  async function handleAddCustomer() {
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      username_sosmed: form.username_sosmed.trim() || null,
      ktp_number: form.ktp_number.trim() || null,
      address: form.address.trim() || null,
      unit_id: form.unit_id || null,
      lead_id: form.lead_id || null,
    };
    // Ownership and status are set on create only — editing must not reassign
    // the customer to whoever happens to be editing, or reset their stage.
    const { error: saveError } = editingId
      ? await supabase.from("customers").update(payload).eq("id", editingId)
      : await supabase.from("customers").insert({ ...payload, sales_agent_id: profile?.id || null, status: "proses" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      toast.gagal(`Gagal menyimpan: ${saveError.message}`);
      return;
    }
    toast.sukses(editingId ? "Perubahan tersimpan." : `${payload.name} ditambahkan.`);
    resetForm();
    fetchAll();
  }

  async function updateStatus(customerId, status) {
    const current = customers.find((c) => c.id === customerId);
    const patch = { status };
    // Stamp the completion date the first time a customer reaches "selesai",
    // and never clear it afterwards — it's the basis of the duration reports,
    // so an accidental status toggle must not destroy it.
    if (status === "selesai" && !current?.process_completed_at) {
      patch.process_completed_at = new Date().toISOString();
    }
    // Hasilnya diperiksa: sebelumnya penolakan RLS lewat tanpa jejak apa pun,
    // dan pengguna hanya melihat status lama muncul kembali tanpa sebab.
    const { error: statusError } = await supabase.from("customers").update(patch).eq("id", customerId);
    if (statusError) {
      toast.gagal(`Status gagal diubah: ${statusError.message}`);
      return;
    }
    fetchAll();
  }

  return (
    <div>
      <PageTitle
        title="Konsumen"
        subtitle={`${customers.length} konsumen tercatat`}
        action={
          <PrimaryButton subject="customer" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            {showForm ? "Tutup" : "+ Konsumen Baru"}
          </PrimaryButton>
        }
      />

      <ReadOnlyBanner />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 12, lineHeight: 1.5 }}>
            Untuk prospek yang sudah booking, gunakan tombol <b>Konversi ke Booking</b> di halaman Prospek — datanya terbawa otomatis
            dan unitnya sekaligus ter-<i>reserve</i>.
          </div>

          <div className="rg-3" style={{ marginBottom: 14, rowGap: 14 }}>
            <Bidang label="Nama" wajib>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="Telepon">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="Username Sosial Media">
              <input value={form.username_sosmed} onChange={(e) => setForm({ ...form, username_sosmed: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="No. KTP">
              <input value={form.ktp_number} onChange={(e) => setForm({ ...form, ktp_number: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="Alamat">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} />
            </Bidang>
            <Bidang label="Unit">
              <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} style={inputStyle}>
                <option value="">Belum ditentukan</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code} ({u.status})
                  </option>
                ))}
              </select>
            </Bidang>
            <Bidang label="Dari Prospek" hint="Mengaitkan konsumen ke riwayat follow-up sebelum booking.">
              <select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} style={inputStyle}>
                <option value="">Tidak dikaitkan</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.phone ? ` — ${telepon(l.phone)}` : ""}
                  </option>
                ))}
              </select>
            </Bidang>
          </div>

          {error && <div style={{ color: "#C2413B", fontSize: 12, marginBottom: 10 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton subject="customer" onClick={handleAddCustomer} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Konsumen"}
            </PrimaryButton>
            <button onClick={resetForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Batal
            </button>
          </div>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          sortable
          searchable
          searchPlaceholder="Cari nama, telepon, unit…"
          searchExtra={(row) => `${row.units?.unit_code || ""} ${row.ktp_number || ""} ${row.email || ""}`}
          pageSize={25}
          onRowClick={(row) => navigate(`/konsumen/${row.id}`)}
          emptyIcon={Users}
          emptyLabel="Belum ada konsumen"
          emptyHint="Konsumen lahir dari prospek yang dikonversi ke Booking, atau bisa ditambahkan langsung di sini."
          filters={[
            {
              key: "status",
              label: "Semua status",
              options: CUSTOMER_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
            },
            {
              key: "handover",
              label: "Semua tanggung jawab",
              get: (row) => (isLocked(row) ? "terkunci" : "sales"),
              options: [
                { value: "sales", label: "Dipegang Sales" },
                { value: "terkunci", label: "Admin Marketing" },
              ],
            },
          ]}
          columns={[
            { key: "name", label: "Nama" },
            {
              key: "phone",
              label: "Kontak",
              sortable: false,
              render: (row) => (
                <KontakAksi
                  phone={row.phone}
                  nama={row.name}
                  tahap={row.leads?.status || row.status}
                  unit={row.units?.unit_code}
                  customerId={row.id}
                  onCatat={fetchAll}
                />
              ),
            },
            { key: "unit", label: "Unit", sortValue: (row) => row.units?.unit_code, render: (row) => row.units?.unit_code || "-" },
            {
              key: "duration",
              label: "Lama Proses",
              sortValue: (row) => row.process_started_at,
              render: (row) => durasiHari(row.process_started_at, row.process_completed_at),
            },
            {
              key: "status",
              label: "Status",
              render: (row) =>
                canEditCustomer(profile, row) ? (
                  <select
                    value={row.status}
                    onChange={(e) => updateStatus(row.id, e.target.value)}
                    aria-label={`Status ${row.name}`}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
                  >
                    {CUSTOMER_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge value={row.status} />
                ),
            },
            {
              key: "handover",
              label: "Tanggung Jawab",
              sortValue: (row) => (isLocked(row) ? 1 : 0),
              render: (row) =>
                isLocked(row) ? (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: ACCENT_DARK, whiteSpace: "nowrap" }} title={lockReason(row)}>
                    🔒 Admin Marketing
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, color: TEXT_MID }}>Sales</span>
                ),
            },
            {
              key: "aksi",
              label: "",
              sortable: false,
              render: (row) => (
                <RowActions>
                  <button onClick={() => navigate(`/konsumen/${row.id}`)} style={gayaBuka}>
                    Buka
                  </button>
                  {canEditCustomer(profile, row) && <EditButton subject="customer" onClick={() => startEdit(row)} />}
                  <DeleteButton
                    subject="customer_delete"
                    itemName={row.name}
                    warning="Progres KPR, dokumen, riwayat pembayaran dan pembatalan milik konsumen ini ikut terhapus permanen. Komplain yang sudah ada tetap tersimpan tanpa kaitan konsumen."
                    onDelete={() => supabase.from("customers").delete().eq("id", row.id)}
                    onDone={fetchAll}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={customers}
        />
      </Card>
    </div>
  );
}

/** Label sungguhan di atas kontrol — placeholder hilang begitu orang mengetik. */
function Bidang({ label, wajib, hint, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
        {label}
        {wajib && <span style={{ color: ACCENT_DARK }} aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

const gayaBuka = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: "#0F2A5C",
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
