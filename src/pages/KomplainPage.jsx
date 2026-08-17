import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useBusinessSettings } from "../lib/useBusinessSettings";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER, TEXT_MID } from "../components/ui";

const PRIORITY_OPTIONS = ["rendah", "sedang", "tinggi"];
const STATUS_OPTIONS = ["baru", "diproses", "selesai"];

const emptyForm = {
  customer_id: "",
  unit_id: "",
  contractor_id: "",
  category: "",
  jenis_komplain: "",
  priority: "sedang",
  description: "",
  tanggal_komplain: new Date().toISOString().slice(0, 10),
  tanggal_serah_terima_kunci: "",
};

function fmt(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("id-ID") : "-";
}

/** In/out of warranty is derived at read time so it can never go stale. */
function warrantyStatus(row) {
  if (!row.akhir_masa_garansi) return { label: "Tanpa data garansi", ok: null };
  const end = new Date(`${row.akhir_masa_garansi}T00:00:00`);
  const at = new Date(`${row.tanggal_komplain || row.created_at?.slice(0, 10)}T00:00:00`);
  return at <= end ? { label: "Dalam garansi", ok: true } : { label: "Di luar garansi", ok: false };
}

export default function KomplainPage() {
  const [complaints, setComplaints] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [kprByCustomer, setKprByCustomer] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Stored as "Label:weight" so the client can retune weights in settings.
  const bobotSettings = useBusinessSettings("bobot_komplain");
  const jenisOptions = bobotSettings.map((v) => v.split(":")[0]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: comp }, { data: cust }, { data: unt }, { data: con }, { data: prof }, { data: kpr }] = await Promise.all([
      supabase
        .from("complaints")
        .select("*, customers(name), units(unit_code), contractors(name), profiles(full_name)")
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, unit_id").order("name"),
      supabase.from("units").select("id, unit_code").order("unit_code"),
      supabase.from("contractors").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("customer_kpr").select("customer_id, tanggal_serah_terima_kunci"),
    ]);
    setComplaints(comp || []);
    setCustomers(cust || []);
    setUnits(unt || []);
    setContractors(con || []);
    setProfiles(prof || []);
    const map = {};
    for (const k of kpr || []) map[k.customer_id] = k.tanggal_serah_terima_kunci;
    setKprByCustomer(map);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Picking a customer pulls their handover date across, which is what drives
  // the warranty window — saves re-typing it and keeps the two consistent.
  function onCustomerChange(customerId) {
    const cust = customers.find((c) => c.id === customerId);
    setForm((f) => ({
      ...f,
      customer_id: customerId,
      unit_id: cust?.unit_id || f.unit_id,
      tanggal_serah_terima_kunci: kprByCustomer[customerId] || f.tanggal_serah_terima_kunci,
    }));
  }

  async function handleAdd() {
    if (!form.description.trim()) {
      setError("Deskripsi komplain wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { path } = await uploadFile("complaint-photos", "complaints", photo);
    const { error } = await supabase.from("complaints").insert({
      customer_id: form.customer_id || null,
      unit_id: form.unit_id || null,
      contractor_id: form.contractor_id || null,
      category: form.category.trim() || null,
      jenis_komplain: form.jenis_komplain || null,
      priority: form.priority,
      description: form.description.trim(),
      tanggal_komplain: form.tanggal_komplain || null,
      tanggal_serah_terima_kunci: form.tanggal_serah_terima_kunci || null,
      photo_url: path,
      status: "baru",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    setPhoto(null);
    setShowForm(false);
    fetchAll();
  }

  async function updateRow(id, patch) {
    const { error } = await supabase.from("complaints").update(patch).eq("id", id);
    if (error) setError(error.message);
    fetchAll();
  }

  async function viewPhoto(path) {
    const url = await getSignedUrl("complaint-photos", path);
    if (url) window.open(url, "_blank");
  }

  const dalamGaransi = complaints.filter((c) => warrantyStatus(c).ok === true).length;
  const belumSelesai = complaints.filter((c) => !c.selesai_perbaikan).length;

  return (
    <div>
      <PageTitle
        title="Komplain"
        subtitle="Komplain pelanggan dengan status garansi, kontraktor penanggung jawab, dan progres perbaikan"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Komplain Baru</PrimaryButton>}
      />

      <div className="rg-3" style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Total Komplain</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{complaints.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Dalam Garansi</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{dalamGaransi}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Belum Selesai Perbaikan</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c25b5b" }}>{belumSelesai}</div>
        </Card>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <select value={form.customer_id} onChange={(e) => onCustomerChange(e.target.value)} style={inputStyle}>
              <option value="">Konsumen</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={form.unit_id} onChange={(e) => set("unit_id", e.target.value)} style={inputStyle}>
              <option value="">Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.unit_code}</option>
              ))}
            </select>
            <select value={form.contractor_id} onChange={(e) => set("contractor_id", e.target.value)} style={inputStyle}>
              <option value="">Kontraktor penanggung jawab</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggal Komplain</div>
              <input type="date" value={form.tanggal_komplain} onChange={(e) => set("tanggal_komplain", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggal Serah Terima Kunci</div>
              <input
                type="date"
                value={form.tanggal_serah_terima_kunci}
                onChange={(e) => set("tanggal_serah_terima_kunci", e.target.value)}
                style={inputStyle}
              />
            </div>
            <select value={form.jenis_komplain} onChange={(e) => set("jenis_komplain", e.target.value)} style={inputStyle}>
              <option value="">Jenis Komplain</option>
              {jenisOptions.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>

            <input placeholder="Kategori (mis. Kualitas Bangunan)" value={form.category} onChange={(e) => set("category", e.target.value)} style={inputStyle} />
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} style={inputStyle}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />

            <textarea
              placeholder="Detail komplain"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 10 }}>
            Masa garansi dan bobot nilai dihitung otomatis dari tanggal serah terima kunci dan jenis komplain.
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAdd} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Komplain"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada komplain."
          columns={[
            { key: "tanggal_komplain", label: "Tanggal", render: (r) => fmt(r.tanggal_komplain) },
            { key: "target", label: "Konsumen / Unit", render: (r) => r.customers?.name || r.units?.unit_code || "-" },
            { key: "contractor", label: "Kontraktor", render: (r) => r.contractors?.name || "-" },
            { key: "description", label: "Detail", render: (r) => <span style={{ whiteSpace: "normal" }}>{r.description}</span> },
            {
              key: "jenis",
              label: "Jenis",
              render: (r) => (r.jenis_komplain ? `${r.jenis_komplain} (${Number(r.bobot_nilai ?? 0)})` : "-"),
            },
            {
              key: "garansi",
              label: "Garansi",
              render: (r) => {
                const w = warrantyStatus(r);
                return (
                  <span style={{ fontSize: 11, color: w.ok === null ? TEXT_MID : w.ok ? "#2f7d4f" : "#c25b5b", fontWeight: 600 }}>
                    {w.label}
                    {r.akhir_masa_garansi ? <span style={{ display: "block", color: TEXT_MID, fontWeight: 400 }}>s/d {fmt(r.akhir_masa_garansi)}</span> : null}
                  </span>
                );
              },
            },
            {
              key: "perbaikan",
              label: "Perbaikan",
              render: (r) =>
                r.selesai_perbaikan ? (
                  <span style={{ fontSize: 11 }}>
                    Selesai
                    <span style={{ display: "block", color: TEXT_MID }}>{fmt(r.tanggal_selesai_perbaikan)}</span>
                  </span>
                ) : (
                  <button onClick={() => updateRow(r.id, { selesai_perbaikan: true })} style={linkBtn}>
                    Tandai selesai
                  </button>
                ),
            },
            {
              key: "assigned_to",
              label: "PIC",
              render: (r) => (
                <select value={r.assigned_to || ""} onChange={(e) => updateRow(r.id, { assigned_to: e.target.value || null })} style={smallSelect}>
                  <option value="">-</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <select
                  value={r.status}
                  onChange={(e) => updateRow(r.id, { status: e.target.value, ...(e.target.value === "selesai" ? { resolved_at: new Date().toISOString() } : {}) })}
                  style={smallSelect}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ),
            },
            { key: "photo", label: "Foto", render: (r) => (r.photo_url ? <button onClick={() => viewPhoto(r.photo_url)} style={linkBtn}>Lihat</button> : "-") },
          ]}
          rows={complaints}
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
  width: "100%",
  boxSizing: "border-box",
};

const smallSelect = { border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 };

const linkBtn = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  cursor: "pointer",
};
