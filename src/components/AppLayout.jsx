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
  ScrollText,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { allowedRoutes, roleLabel } from "../lib/permissions";
import GlobalSearch from "./GlobalSearch";
import { PRIMARY, PRIMARY_DARK, ACCENT, PAGE_BG, SURFACE, BORDER, TEXT_DARK, TEXT_MID, ON_PRIMARY, ON_PRIMARY_FAINT } from "./ui";

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
      { to: "/log-aktivitas", icon: ScrollText, label: "Log Aktivitas" },
    ],
  },
];

/** Drops menu items the signed-in role has no route for (permissions.js). */
function visibleSections(profile) {
  const allowed = allowedRoutes(profile);
  return navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed.includes(item.to)) }))
    .filter((section) => section.items.length > 0);
}

function NavItem({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
      style={({ isActive }) => ({
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 13px",
        borderRadius: 11,
        fontSize: 13.5,
        textDecoration: "none",
        color: isActive ? "#fff" : ON_PRIMARY,
        fontWeight: isActive ? 600 : 500,
        background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
        marginBottom: 2,
        transition: "background 0.15s ease, color 0.15s ease",
      })}
    >
      {({ isActive }) => (
        <>
          {/* Deep-orange rail marks the active page — PRD §2.1 gives the accent
              to active progress, and it survives greyscale printing. */}
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 9,
              bottom: 9,
              width: 3,
              borderRadius: 3,
              background: isActive ? ACCENT : "transparent",
            }}
          />
          <Icon size={17} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function IconButton({ icon: Icon, onClick, title, className }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`icon-btn${className ? ` ${className}` : ""}`}
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const firstName = (profile?.full_name || "").split(" ")[0] || "...";

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", background: PAGE_BG, color: TEXT_DARK }}>
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div
        className={`app-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          width: 244,
          flexShrink: 0,
          background: PRIMARY_DARK,
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
                background: "rgba(255,255,255,0.10)",
                color: ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Asterisk size={20} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", color: "#fff" }}>Zafira Property</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="menu-toggle"
            style={{ background: "none", border: "none", color: ON_PRIMARY, cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {visibleSections(profile).map((section, i) => (
            <div key={i}>
              {section.title && (
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: ON_PRIMARY_FAINT,
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
            borderRadius: 11,
            fontSize: 13.5,
            fontWeight: 500,
            color: ON_PRIMARY,
            background: "none",
            border: "1px solid rgba(255,255,255,0.18)",
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
                {profile?.role ? `Masuk sebagai ${roleLabel(profile.role)}` : "Pantau prospek, konsumen, dan progres proyek Anda"}
              </p>
            </div>
          </div>

          <div className="topbar-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div className="topbar-search" style={{ width: 320 }}>
              <GlobalSearch />
            </div>

            {/* Under 980px the inline box is hidden; searching stays reachable
                through this toggle instead of disappearing. */}
            <IconButton
              icon={Search}
              className="search-toggle"
              title="Cari catatan"
              onClick={() => setMobileSearchOpen((v) => !v)}
            />

            <IconButton icon={Bell} title="Notifikasi" />

            <div
              title={`${profile?.full_name || ""}${profile?.role ? ` — ${roleLabel(profile.role)}` : ""}`}
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

        {mobileSearchOpen && (
          <div className="mobile-search" style={{ padding: "0 14px 14px" }}>
            <GlobalSearch onNavigate={() => setMobileSearchOpen(false)} />
          </div>
        )}

        <div className="app-content" style={{ padding: "0 26px 26px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
