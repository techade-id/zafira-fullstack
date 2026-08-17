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
  Asterisk,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PRIMARY, PRIMARY_SOFT, PAGE_BG, SURFACE, BORDER, TEXT_DARK, TEXT_MID } from "./ui";

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
      { to: "/rencana-proyek", icon: ClipboardList, label: "Rencana Proyek" },
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
      className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 13px",
        borderRadius: 13,
        fontSize: 13.5,
        textDecoration: "none",
        color: isActive ? "#fff" : TEXT_MID,
        fontWeight: isActive ? 600 : 500,
        background: isActive ? PRIMARY : "transparent",
        marginBottom: 2,
        transition: "background 0.15s ease",
      })}
    >
      <Icon size={17} />
      <span>{label}</span>
    </NavLink>
  );
}

function IconButton({ icon: Icon, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="icon-btn"
      style={{
        width: 42,
        height: 42,
        borderRadius: "50%",
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        color: TEXT_DARK,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Icon size={17} />
    </button>
  );
}

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const firstName = (profile?.full_name || "").split(" ")[0] || "...";

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", background: PAGE_BG, color: TEXT_DARK }}>
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div
        className={`app-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          width: 244,
          flexShrink: 0,
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 6px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                background: PRIMARY_SOFT,
                color: PRIMARY,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Asterisk size={20} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em" }}>Griya Zafira</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="menu-toggle"
            style={{ background: "none", border: "none", color: TEXT_MID, cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {navSections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: TEXT_MID,
                    padding: "16px 13px 7px",
                    fontWeight: 600,
                  }}
                >
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} />
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={signOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "10px 13px",
            marginTop: 14,
            borderRadius: 13,
            fontSize: 13.5,
            fontWeight: 500,
            color: TEXT_MID,
            background: "none",
            border: `1px solid ${BORDER}`,
            cursor: "pointer",
            width: "100%",
          }}
        >
          <LogOut size={17} />
          Keluar
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          className="topbar"
          style={{ padding: "22px 26px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="menu-toggle"
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 13,
                padding: 10,
                cursor: "pointer",
                color: TEXT_DARK,
                flexShrink: 0,
              }}
            >
              <Menu size={18} />
            </button>
            <div className="topbar-greeting" style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 21, margin: 0, letterSpacing: "-0.02em" }}>Halo, {firstName}!</h1>
              <p style={{ fontSize: 13, color: TEXT_MID, margin: "3px 0 0" }}>
                Pantau prospek, konsumen, dan progres proyek Anda
              </p>
            </div>
          </div>

          <div className="topbar-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div
              className="topbar-search"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 999,
                padding: "5px 5px 5px 18px",
                fontSize: 13,
                color: TEXT_MID,
                width: 280,
              }}
            >
              <span style={{ flex: 1 }}>Cari catatan</span>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: TEXT_DARK,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Search size={15} />
              </span>
            </div>

            <IconButton icon={Bell} title="Notifikasi" />

            <div
              title={profile?.full_name || ""}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: PRIMARY,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        <div className="app-content" style={{ padding: "0 26px 26px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
