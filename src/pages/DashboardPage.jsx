import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, TEXT_MID, ORANGE_DARK, ORANGE, ORANGE_LIGHT, ORANGE_PALE } from "../components/ui";
import { Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState({ leads: 0, customers: 0, units: 0, complaints: 0 });

  useEffect(() => {
    async function loadCounts() {
      const [leads, customers, units, complaints] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("units").select("id", { count: "exact", head: true }).eq("status", "tersedia"),
        supabase.from("complaints").select("id", { count: "exact", head: true }).neq("status", "selesai"),
      ]);
      setCounts({
        leads: leads.count || 0,
        customers: customers.count || 0,
        units: units.count || 0,
        complaints: complaints.count || 0,
      });
    }
    loadCounts();
  }, []);

  const cards = [
    { label: "Total Prospek", value: counts.leads },
    { label: "Total Konsumen", value: counts.customers },
    { label: "Unit Tersedia", value: counts.units },
    { label: "Komplain Aktif", value: counts.complaints },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: `linear-gradient(135deg, ${ORANGE_LIGHT}, #fff)`,
          border: `1px solid ${ORANGE_PALE}`,
          padding: "18px 22px",
          borderRadius: 14,
          marginBottom: 22,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 12, background: ORANGE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Building2 size={22} />
        </div>
        <h1 style={{ fontSize: 19, margin: 0 }}>Selamat Datang, {profile?.full_name || "..."}</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ borderTop: `4px solid ${ORANGE}` }}>
            <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 10 }}>{c.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: ORANGE_DARK }}>{c.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
