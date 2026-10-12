import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, Lock, FolderClock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canEditCustomer, isLocked, lockReason, roleOf } from "../lib/permissions";
import { durasiHari, telepon, selisihHari } from "../lib/format";
import KontakAksi from "../components/KontakAksi";
import {
  Card,
  PageTitle,
  PrimaryButton,
  DataTable,
  BORDER,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  POSITIVE,
  DeleteButton,
  EditButton,
  RowActions,
  ReadOnlyBanner,
  inputStyle,
} from "../components/ui";

const CUSTOMER_STATUS_OPTIONS = ["proses", "aktif", "selesai", "batal"];

/**
 * Progres KPR, dibaca dari tonggak berkasnya — bukan dipilih. Yang lebih jauh
 * menang: konsumen yang sudah akad tidak lagi ditampilkan sebagai SP3K.
 */
const PROGRES = [
  { kunci: "pemberkasan", label: "Pemberkasan", warna: { bg: ACCENT_SOFT, fg: ACCENT_DARK } },
  { kunci: "bank", label: "Proses Bank", warna: { bg: PRIMARY_SOFT, fg: PRIMARY } },
  { kunci: "sp3k", label: "SP3K", warna: { bg: "#E8EEFB", fg: "#2B4C8C" } },
  { kunci: "akad", label: "Akad", warna: { bg: "#E4F2E8", fg: POSITIVE } },
  { kunci: "batal", label: "Batal", warna: { bg: "#FBE9E8", fg: NEGATIVE } },
];

function kprDari(row) {
  return (Array.isArray(row.customer_kpr) ? row.customer_kpr[0] : row.customer_kpr) || {};
}

function progresKonsumen(row) {
  if (row.status === "batal") return "batal";
  const k = kprDari(row);
  if (k.tanggal_akad) return "akad";
  if (k.tanggal_sp3k_terbit) return "sp3k";
  if (k.tanggal_masuk_bank || k.proses_bank_at) return "bank";
  return "pemberkasan";
}

/**
 * Daftar konsumen.
 *
 * Urut abjad secara bawaan. Kolomnya yang dibutuhkan untuk memantau proses:
 * nama, unit, lama proses, progres (Pemberkasan → Proses Bank → SP3K → Akad),
 * Sales penanggung jawab, dan bank. Kontak hanya untuk Sales — peran lain
 * menghubungi konsumen dari kartunya.
 *
 * Konsumen yang lama prosesnya sudah melewati batas (bawaan 14 hari, di
 * Pengaturan Bisnis) tetapi berkasnya belum masuk bank ditandai "Siapkan
 * berkas": itulah tanda Admin Marketing harus mulai membereskannya.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [batasBerkas, setBatasBerkas] = useState(14);
  const peranSales = roleOf(profile) === "sales";

  function resetForm() {
    setForm(emptyForm);
    setShowForm(false);
    setError("");
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: cust }, { data: unt }, { data: ld }, { data: batas }] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("customers")
          .select(
            "*, units(unit_code, block), leads(status), profiles:sales_agent_id(full_name), customer_kpr(nama_bank, tanggal_masuk_bank, proses_bank_at, tanggal_sp3k_terbit, tanggal_akad)"
          )
          .order("name", { ascending: true })
      ),
      supabase.from("units").select("id, unit_code, status").order("unit_code"),
      supabase.from("leads").select("id, name, phone").order("name"),
      supabase.from("app_settings").select("value").eq("key", "siapkan_berkas_hari").maybeSingle(),
    ]);
    setCustomers(cust || []);
    setUnits(unt || []);
    setLeads(ld || []);
    const n = Number(batas?.value);
    setBatasBerkas(Number.isFinite(n) && n > 0 ? n : 14);
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
    // Formulir ini hanya untuk konsumen baru. Mengubah data konsumen ada di
    // kartunya sendiri (/konsumen/:id), tempat unit sengaja tidak bisa diganti:
    // mengganti unit_id di sini dulu meninggalkan status unit lama dan baru
    // di siteplan tanpa diperbarui.
    const { error: saveError } = await supabase
      .from("customers")
      .insert({ ...payload, sales_agent_id: profile?.id || null, status: "proses" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      toast.gagal(`Gagal menyimpan: ${saveError.message}`);
      return;
    }
    toast.sukses(`${payload.name} ditambahkan.`);
    resetForm();
    fetchAll();
  }

  const baris = useMemo(
    () =>
      customers.map((c) => {
        const progres = progresKonsumen(c);
        const hari = selisihHari(c.process_completed_at || new Date(), c.process_started_at);
        return {
          ...c,
          progres,
          hari_proses: hari,
          bank: kprDari(c).nama_bank || "",
          sales_nama: c.profiles?.full_name || "",
          // Tanda untuk Admin Marketing: sudah lama, berkas belum di bank.
          siapkan_berkas: progres === "pemberkasan" && ["proses", "aktif"].includes(c.status) && hari != null && hari >= batasBerkas,
        };
      }),
    [customers, batasBerkas]
  );

  return (
    <div>
      <PageTitle
        title="Konsumen"
        subtitle={`${customers.length} konsumen tercatat · urut abjad`}
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
            Konsumen semestinya lahir dari prospek yang sudah ada: gunakan <b>Konversi ke Booking</b> di menu Leads atau Follow Up
            Leads — datanya terbawa otomatis, unitnya sekaligus ter-<i>reserve</i>, dan riwayat follow-up sebelum booking tidak
            terputus. Formulir di bawah ini hanya untuk konsumen yang memang tidak pernah melewati tahap prospek.
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
              {saving ? "Menyimpan..." : "Simpan Konsumen"}
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
          searchExtra={(row) => `${row.units?.unit_code || ""} ${row.ktp_number || ""} ${row.email || ""} ${row.sales_nama} ${row.bank}`}
          pageSize={25}
          defaultSort={{ key: "name", arah: "asc" }}
          onRowClick={(row) => navigate(`/konsumen/${row.id}`)}
          emptyIcon={Users}
          emptyLabel="Belum ada konsumen"
          emptyHint="Konsumen lahir dari prospek yang dikonversi ke Booking, atau bisa ditambahkan langsung di sini."
          filters={[
            {
              key: "progres",
              label: "Semua progres",
              options: PROGRES.map((p) => ({ value: p.kunci, label: p.label })),
            },
            {
              key: "siapkan",
              label: "Semua lama proses",
              get: (row) => (row.siapkan_berkas ? "ya" : "tidak"),
              options: [{ value: "ya", label: `Siapkan berkas (≥ ${batasBerkas} hari)` }],
            },
            {
              key: "status",
              label: "Semua status",
              options: CUSTOMER_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
            },
          ]}
          columns={[
            { key: "name", label: "Nama" },
            // Kontak hanya untuk Sales; peran lain menghubungi dari kartu konsumen.
            peranSales && {
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
              sortValue: (row) => row.hari_proses ?? -1,
              render: (row) => (
                <div style={{ whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 12.5, color: TEXT_DARK }}>{durasiHari(row.process_started_at, row.process_completed_at)}</div>
                  {row.siapkan_berkas && (
                    <span
                      title={`Sudah ${row.hari_proses} hari dan berkas belum masuk bank — Admin Marketing perlu menyiapkan berkasnya.`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 10.5, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "2px 8px", borderRadius: 999 }}
                    >
                      <FolderClock size={10} aria-hidden="true" />
                      Siapkan berkas
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: "progres",
              label: "Progres",
              sortValue: (row) => PROGRES.findIndex((p) => p.kunci === row.progres),
              render: (row) => {
                const p = PROGRES.find((x) => x.kunci === row.progres);
                return (
                  <span style={{ fontSize: 11, fontWeight: 700, background: p.warna.bg, color: p.warna.fg, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                    {p.label}
                  </span>
                );
              },
            },
            {
              key: "sales_nama",
              label: "Tanggung Jawab",
              render: (row) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: TEXT_DARK, whiteSpace: "nowrap" }}>
                  {row.sales_nama || "-"}
                  {/* Setelah kuitansi Booking Fee terverifikasi, berkasnya
                      dipegang Admin Marketing (Handover Hard-Lock). */}
                  {isLocked(row) && (
                    <span title={lockReason(row)} aria-label="Berkas dipegang Admin Marketing" style={{ lineHeight: 0 }}>
                      <Lock size={11} color={ACCENT_DARK} aria-hidden="true" />
                    </span>
                  )}
                </span>
              ),
            },
            { key: "bank", label: "Bank", render: (row) => row.bank || "-" },
            {
              key: "aksi",
              label: "",
              sortable: false,
              render: (row) => (
                <RowActions>
                  <button onClick={() => navigate(`/konsumen/${row.id}`)} style={gayaBuka}>
                    Buka
                  </button>
                  {canEditCustomer(profile, row) && <EditButton subject="customer" onClick={() => navigate(`/konsumen/${row.id}?ubah=1`)} />}
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
          ].filter(Boolean)}
          rows={baris}
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
