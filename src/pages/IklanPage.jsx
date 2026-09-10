import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
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
  ACCENT,
  NEGATIVE,
  DeleteButton,
  EditButton,
  RowActions,
  ReadOnlyBanner,
} from "../components/ui";

const PLATFORMS = ["Instagram", "Facebook Ads", "TikTok", "Google Ads", "Lainnya"];

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString("id-ID")}`;
}

export default function IklanPage() {
  const [ads, setAds] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = { platform: PLATFORMS[0], campaign_id: "", campaign_name: "", report_date: "", spend: "", impressions: "", clicks: "", leads_generated: "" };
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
      platform: row.platform || PLATFORMS[0],
      campaign_id: row.campaign_id || "",
      campaign_name: row.campaign_name || "",
      report_date: row.report_date || "",
      spend: row.spend ?? "",
      impressions: row.impressions ?? "",
      clicks: row.clicks ?? "",
      leads_generated: row.leads_generated ?? "",
    });
    setEditingId(row.id);
    setShowForm(true);
    setError("");
  }

  async function fetchAds() {
    setLoading(true);
    const [adsRes, campRes, perfRes] = await Promise.all([
      supabase.from("ads_analytics").select("*, ads_campaigns(name, platform)").order("report_date", { ascending: false }),
      supabase.from("ads_campaigns").select("id, name, platform, is_active").order("name"),
      supabase.rpc("campaign_performance", { p_from: null, p_to: null }),
    ]);
    setAds(adsRes.data || []);
    setCampaigns(campRes.data || []);
    // Arrives with migration_010; the page still works without it, minus the
    // per-campaign card.
    setPerformance(perfRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAds();
  }, []);

  /** Picking a campaign fixes the platform — they cannot disagree. */
  function pickCampaign(id) {
    const c = campaigns.find((x) => x.id === id);
    setForm((f) => ({ ...f, campaign_id: id, platform: c?.platform || f.platform }));
  }

  async function handleAddAd() {
    if (!form.report_date) {
      setError("Tanggal laporan wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      platform: form.platform,
      campaign_id: form.campaign_id || null,
      // Kept for rows recorded before campaigns existed, and for one-off spends
      // that never got a campaign row.
      campaign_name: form.campaign_name.trim() || null,
      report_date: form.report_date,
      spend: form.spend ? Number(form.spend) : 0,
      impressions: form.impressions ? Number(form.impressions) : 0,
      clicks: form.clicks ? Number(form.clicks) : 0,
      leads_generated: form.leads_generated ? Number(form.leads_generated) : 0,
    };
    const { error: saveError } = editingId
      ? await supabase.from("ads_analytics").update(payload).eq("id", editingId)
      : await supabase.from("ads_analytics").insert(payload);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    resetForm();
    fetchAds();
  }

  const byPlatform = useMemo(() => {
    const map = {};
    for (const a of ads) {
      if (!map[a.platform]) map[a.platform] = { platform: a.platform, spend: 0, clicks: 0 };
      map[a.platform].spend += Number(a.spend || 0);
      map[a.platform].clicks += a.clicks || 0;
    }
    return Object.values(map).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const maxSpend = Math.max(1, ...byPlatform.map((p) => p.spend));
  const totalSpend = ads.reduce((s, a) => s + Number(a.spend || 0), 0);

  // Counted from leads actually tagged to a campaign, not from the number
  // someone copied off the platform dashboard.
  const trackedLeads = performance.reduce((s, p) => s + Number(p.leads_count || 0), 0);
  const trackedDeals = performance.reduce((s, p) => s + Number(p.deals_count || 0), 0);
  const trackedSpend = performance.reduce((s, p) => s + Number(p.spend || 0), 0);
  const untaggedSpend = totalSpend - trackedSpend;

  const activeCampaigns = campaigns.filter((c) => c.is_active);
  const maxCampaignSpend = Math.max(1, ...performance.map((p) => Number(p.spend || 0)));

  return (
    <div>
      <PageTitle
        title="Digital Ads"
        subtitle="Biaya per lead dihitung dari prospek yang benar-benar terkait campaign"
        action={<PrimaryButton subject="ads" onClick={() => (showForm ? resetForm() : setShowForm(true))}>{showForm ? "Tutup" : "+ Catat Performa"}</PrimaryButton>}
      />

      <ReadOnlyBanner />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Campaign</div>
              <select value={form.campaign_id} onChange={(e) => pickCampaign(e.target.value)} style={inputStyle}>
                <option value="">— tanpa campaign —</option>
                {activeCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.platform} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Platform</div>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={inputStyle} disabled={Boolean(form.campaign_id)}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggal Laporan *</div>
              <input type="date" value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Spend (Rp)</div>
              <input type="number" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Impressions</div>
              <input type="number" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Klik</div>
              <input type="number" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} style={inputStyle} />
            </div>
            {!form.campaign_id && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Nama campaign (teks bebas, hanya bila belum terdaftar)</div>
                <input value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} style={inputStyle} />
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>
                Leads menurut platform (opsional) — hanya pembanding; angka resmi dihitung dari prospek yang tercatat
              </div>
              <input type="number" value={form.leads_generated} onChange={(e) => setForm({ ...form, leads_generated: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {!form.campaign_id && activeCampaigns.length === 0 && (
            <div style={{ fontSize: 12, color: ACCENT, marginBottom: 10, lineHeight: 1.5 }}>
              Belum ada campaign terdaftar. Tambahkan di <b>Pengaturan Bisnis → Ads Campaign</b> supaya biaya per lead bisa dihitung.
            </div>
          )}
          {error && <div style={{ color: NEGATIVE, fontSize: 12, marginBottom: 10 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton subject="ads" onClick={handleAddAd} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan"}
            </PrimaryButton>
            <button onClick={resetForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Batal
            </button>
          </div>
        </Card>
      )}

      <div className="rg-3" style={{ marginBottom: 18 }}>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 6 }}>Total Spend</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{rupiah(totalSpend)}</div>
          {untaggedSpend > 0 && (
            <div style={{ fontSize: 11.5, color: ACCENT, marginTop: 5 }}>{rupiah(untaggedSpend)} belum terkait campaign</div>
          )}
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 6 }}>Biaya per Lead</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{trackedLeads > 0 ? rupiah(Math.round(trackedSpend / trackedLeads)) : "-"}</div>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 5 }}>{trackedLeads} prospek dari campaign</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 6 }}>Biaya per Deal</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{trackedDeals > 0 ? rupiah(Math.round(trackedSpend / trackedDeals)) : "-"}</div>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 5 }}>{trackedDeals} mencapai Booking atau lebih</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Performa per Campaign</div>
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 14 }}>
          Jumlah lead dihitung dari tabel prospek (kolom Sumber = Ads), bukan dari angka yang diketik manual.
        </div>

        {performance.length === 0 && (
          <div style={{ fontSize: 13, color: TEXT_MID }}>
            Belum ada campaign. Daftarkan di Pengaturan Bisnis, lalu pilih campaign itu saat membuat prospek bersumber Ads.
          </div>
        )}

        {performance.map((p) => (
          <div key={p.campaign_id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5, gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: TEXT_DARK }}>
                {p.nama}
                <span style={{ color: TEXT_MID, fontWeight: 400 }}> · {p.platform}</span>
                {!p.aktif && <span style={{ color: TEXT_MID, fontWeight: 400 }}> · nonaktif</span>}
              </span>
              <span style={{ color: TEXT_MID }}>
                {rupiah(p.spend)} · <b style={{ color: TEXT_DARK }}>{p.leads_count}</b> lead · {p.deals_count} deal
                {p.cost_per_lead != null && <> · {rupiah(p.cost_per_lead)}/lead</>}
              </span>
            </div>
            <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 9, overflow: "hidden" }}>
              <div style={{ background: PRIMARY, height: "100%", width: `${(Number(p.spend) / maxCampaignSpend) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Spend per Platform</div>
        {byPlatform.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data.</div>}
        {byPlatform.map((p) => (
          <div key={p.platform} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{p.platform}</span>
              <span style={{ color: TEXT_MID }}>{rupiah(p.spend)} · {p.clicks} klik</span>
            </div>
            <div style={{ background: BORDER, borderRadius: 20, height: 10, overflow: "hidden" }}>
              <div style={{ background: ACCENT, height: "100%", width: `${(p.spend / maxSpend) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada data iklan."
          columns={[
            { key: "report_date", label: "Tanggal", render: (row) => new Date(row.report_date).toLocaleDateString("id-ID") },
            { key: "platform", label: "Platform" },
            {
              key: "campaign",
              label: "Campaign",
              render: (row) =>
                row.ads_campaigns?.name ? (
                  row.ads_campaigns.name
                ) : row.campaign_name ? (
                  <span title="Belum terkait tabel campaign — biaya ini tidak masuk hitungan biaya per lead">
                    {row.campaign_name} <span style={{ color: ACCENT }}>•</span>
                  </span>
                ) : (
                  "-"
                ),
            },
            { key: "spend", label: "Spend", render: (row) => rupiah(row.spend) },
            { key: "impressions", label: "Impressions", render: (row) => Number(row.impressions).toLocaleString("id-ID") },
            { key: "clicks", label: "Klik" },
            { key: "leads_generated", label: "Leads (platform)", render: (row) => <span style={{ color: TEXT_MID }}>{row.leads_generated || 0}</span> },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <RowActions>
                  <EditButton subject="ads" onClick={() => startEdit(row)} />
                  <DeleteButton
                    subject="ads"
                    itemName={`${row.platform} ${row.ads_campaigns?.name || row.campaign_name || ""}`.trim()}
                    onDelete={() => supabase.from("ads_analytics").delete().eq("id", row.id)}
                    onDone={fetchAds}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={ads}
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
