import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, ORANGE } from "../components/ui";

const PLATFORMS = ["Instagram", "Facebook Ads", "TikTok", "Google Ads", "Lainnya"];

export default function IklanPage() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: PLATFORMS[0], campaign_name: "", report_date: "", spend: "", impressions: "", clicks: "", leads_generated: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchAds() {
    setLoading(true);
    const { data } = await supabase.from("ads_analytics").select("*").order("report_date", { ascending: false });
    setAds(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAds();
  }, []);

  async function handleAddAd() {
    if (!form.report_date) {
      setError("Tanggal laporan wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("ads_analytics").insert({
      platform: form.platform,
      campaign_name: form.campaign_name.trim() || null,
      report_date: form.report_date,
      spend: form.spend ? Number(form.spend) : 0,
      impressions: form.impressions ? Number(form.impressions) : 0,
      clicks: form.clicks ? Number(form.clicks) : 0,
      leads_generated: form.leads_generated ? Number(form.leads_generated) : 0,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ platform: PLATFORMS[0], campaign_name: "", report_date: "", spend: "", impressions: "", clicks: "", leads_generated: "" });
    setShowForm(false);
    fetchAds();
  }

  const byPlatform = useMemo(() => {
    const map = {};
    for (const a of ads) {
      if (!map[a.platform]) map[a.platform] = { platform: a.platform, spend: 0, leads: 0, clicks: 0 };
      map[a.platform].spend += Number(a.spend || 0);
      map[a.platform].leads += a.leads_generated || 0;
      map[a.platform].clicks += a.clicks || 0;
    }
    return Object.values(map).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const maxSpend = Math.max(1, ...byPlatform.map((p) => p.spend));
  const totalSpend = ads.reduce((s, a) => s + Number(a.spend || 0), 0);
  const totalLeads = ads.reduce((s, a) => s + (a.leads_generated || 0), 0);

  return (
    <div>
      <PageTitle
        title="Digital Ads"
        subtitle="Analisis performa iklan/konten digital yang menghasilkan prospek"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Catat Performa</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={inputStyle}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input placeholder="Nama campaign" value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} style={inputStyle} />
            <input type="date" value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} style={inputStyle} />
            <input placeholder="Spend (Rp)" type="number" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} style={inputStyle} />
            <input placeholder="Impressions" type="number" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} style={inputStyle} />
            <input placeholder="Klik" type="number" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} style={inputStyle} />
            <input placeholder="Leads dihasilkan" type="number" value={form.leads_generated} onChange={(e) => setForm({ ...form, leads_generated: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddAd} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </PrimaryButton>
        </Card>
      )}

      <div className="rg-2" style={{ marginBottom: 18 }}>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 6 }}>Total Spend</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Rp{totalSpend.toLocaleString("id-ID")}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 6 }}>Total Leads Dihasilkan</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>
            {totalLeads} {totalLeads > 0 && <span style={{ fontSize: 13, color: TEXT_MID, fontWeight: 400 }}>(Rp{Math.round(totalSpend / totalLeads).toLocaleString("id-ID")}/lead)</span>}
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Spend & Leads per Platform</div>
        {byPlatform.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data.</div>}
        {byPlatform.map((p) => (
          <div key={p.platform} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{p.platform}</span>
              <span style={{ color: TEXT_MID }}>
                Rp{p.spend.toLocaleString("id-ID")} · {p.leads} leads · {p.clicks} klik
              </span>
            </div>
            <div style={{ background: BORDER, borderRadius: 20, height: 10, overflow: "hidden" }}>
              <div style={{ background: ORANGE, height: "100%", width: `${(p.spend / maxSpend) * 100}%` }} />
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
            { key: "campaign_name", label: "Campaign", render: (row) => row.campaign_name || "-" },
            { key: "spend", label: "Spend", render: (row) => `Rp${Number(row.spend).toLocaleString("id-ID")}` },
            { key: "impressions", label: "Impressions", render: (row) => Number(row.impressions).toLocaleString("id-ID") },
            { key: "clicks", label: "Klik" },
            { key: "leads_generated", label: "Leads" },
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
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
};
