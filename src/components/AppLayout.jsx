import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  Target,
  Users,
  Building2,
  Map,
  Wallet,
  XCircle,
  HardHat,
  ClipboardList,
  MessageSquareWarning,
  BarChart2,
  Megaphone,
  LogOut,
  Search,
  Bell,
  Flag,
  UserCog,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ORANGE = "#ff7a1a";
const ORANGE_LIGHT = "#fff1e6";
const ORANGE_PALE = "#ffe4cc";
const ORANGE_DARK = "#e8630a";
const BORDER = "#f0dfc8";
const TEXT_DARK = "#2c2013";
const TEXT_MID = "#6b5c4c";

const navSections = [
  {
    title: null,
    items: [{ to: "/", icon: Home, label: "Dashboard", end: true }],
  },
  {
    title: "Penjualan",
    items: [
      { to: "/prospek", icon: Target, label: "Prospek" },
      { to: "/konsumen", icon: Users, label: "Konsumen" },
      { to: "/pembayaran", icon: Wallet, label: "Pembayaran" },
      { to: "/pembatalan", icon: XCircle, label: "Pembatalan" },
      { to: "/reminder", icon: Bell, label: "Reminder" },
      { to: "/target", icon: Flag, label: "Penetapan Target" },
    ],
  },
  {
    title: "Proyek",
    items: [
      { to: "/proyek", icon: Building2, label: "Proyek" },
      { to: "/siteplan", icon: Map, label: "Siteplan Digital" },
      { to: "/kontraktor", icon: HardHat, label: "Kontraktor" },
      { to: "/monitoring-lapangan", icon: ClipboardList, label: "Monitoring Lapangan" },
      { to: "/komplain", icon: MessageSquareWarning, label: "Komplain" },
    ],
  },
  {
    title: "Analitik",
    items: [
      { to: "/laporan", icon: BarChart2, label: "Laporan" },
      { to: "/iklan", icon: Megaphone, label: "Digital Ads" },
    ],
  },
  {
    title: "Pengaturan",
    items: [
      { to: "/data-agen", icon: UserCog, label: "Data Agen" },
      { to: "/pengaturan-bisnis", icon: Settings, label: "Pengaturan Bisnis" },
    ],
  },
];

function NavItem({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 14,
        textDecoration: "none",
        color: isActive ? "#fff" : "#e4d4c2",
        fontWeight: isActive ? 600 : 400,
        background: isActive ? ORANGE : "transparent",
      })}
    >
      <Icon size={16} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", fontFamily: "'Segoe UI', Arial, sans-serif", background: "#fffaf5", color: TEXT_DARK }}>
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div
        className={`app-sidebar${sidebarOpen ? " open" : ""}`}
        style={{ width: 240, height: "100vh", background: "#2c1a0e", color: "#f5e6d8", flexShrink: 0, display: "flex", flexDirection: "column", padding: "18px 0", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 20px 20px", fontWeight: 700, fontSize: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>G</div>
            <span>Griya Zafira CRM</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="menu-toggle"
            style={{ background: "none", border: "none", color: "#e4d4c2", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {navSections.map((section, i) => (
          <div key={i}>
            {section.title && (
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#a8917a", padding: "14px 20px 6px" }}>
                {section.title}
              </div>
            )}
            <div style={{ padding: "0 10px" }}>
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="topbar" style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="menu-toggle"
              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, cursor: "pointer", color: TEXT_DARK, flexShrink: 0 }}
            >
              <Menu size={18} />
            </button>
            <div className="topbar-search" style={{ display: "flex", alignItems: "center", gap: 8, background: ORANGE_LIGHT, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: TEXT_MID, width: 240 }}>
              <Search size={14} />
              <span>Cari catatan</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <div className="topbar-user-role" style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{profile?.full_name || "..."}</div>
              <div style={{ fontSize: 11, color: TEXT_MID, textTransform: "capitalize" }}>{profile?.role?.replace("_", " ") || ""}</div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: ORANGE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <button
              onClick={signOut}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: ORANGE_DARK, background: ORANGE_LIGHT, border: `1px solid ${ORANGE_PALE}`, padding: "6px 12px", borderRadius: 6, cursor: "pointer", flexShrink: 0 }}
            >
              <LogOut size={13} />
              Keluar
            </button>
          </div>
        </div>

        <div className="app-content" style={{ padding: "26px 28px", overflowY: "auto" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
