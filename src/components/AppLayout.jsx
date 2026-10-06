import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Home,
  Target,
  Users,
  Building2,
  Map,
  Wallet,
  FolderOpen,
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
  PanelLeftClose,
  PanelLeftOpen,
  HardHat as HardHatIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { allowedRoutes, roleLabel } from "../lib/permissions";
import GlobalSearch from "./GlobalSearch";
import NotifBell from "./NotifBell";
import TambahProspekCepat from "./TambahProspekCepat";
import { SURFACE, BORDER, TEXT_DARK } from "./ui";

const navSections = [
  {
    title: null,
    items: [{ to: "/", icon: Home, label: "Dashboard", end: true }],
  },
  {
    title: "Penjualan",
    items: [
      { to: "/prospek", icon: Target, label: "Leads" },
      { to: "/konsumen", icon: Users, label: "Konsumen" },
      { to: "/pemberkasan", icon: FolderOpen, label: "Papan Berkas" },
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
      { to: "/lapangan", icon: HardHatIcon, label: "Monitoring Lapangan" },
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
      { to: "/data-agen", icon: UserCog, label: "Pengguna" },
      { to: "/pengaturan-bisnis", icon: Settings, label: "Pengaturan Bisnis" },
      { to: "/log-aktivitas", icon: ScrollText, label: "Log Aktivitas" },
    ],
  },
];

/** Halaman yang punya rute tapi tidak duduk di menu — judulnya tetap harus ada. */
const JUDUL_LUAR_MENU = {
  "/cari": { label: "Hasil Pencarian", section: "Penjualan" },
};

const RAIL_KEY = "zafira:sidebar-rail";

/** Drops menu items the signed-in role has no route for (permissions.js). */
function visibleSections(profile) {
  const allowed = allowedRoutes(profile);
  return navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed.includes(item.to)) }))
    .filter((section) => section.items.length > 0);
}

/**
 * Judul halaman yang sedang dibuka, diambil dari menu itu sendiri.
 *
 * Sapaan "Halo, nama" hanya benar-benar berguna di Dashboard; di halaman lain
 * baris teratas sebaiknya menjawab "saya sedang di mana" — terlebih setelah
 * sidebar bisa diciutkan menjadi ikon saja. Pencocokan memakai awalan terpanjang
 * supaya /konsumen/:id ikut mewarisi judul "Konsumen".
 */
function konteksHalaman(pathname) {
  if (pathname === "/") return null;
  if (JUDUL_LUAR_MENU[pathname]) return JUDUL_LUAR_MENU[pathname];

  let cocok = null;
  for (const section of navSections) {
    for (const item of section.items) {
      if (item.to === "/") continue;
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!cocok || item.to.length > cocok.to.length) cocok = { ...item, section: section.title };
      }
    }
  }
  return cocok;
}

/** Menjaga logika layout dan media query CSS memakai titik putus yang sama. */
function useMediaQuery(query) {
  const [cocok, setCocok] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setCocok(e.matches);
    setCocok(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return cocok;
}

function NavItem({ to, icon: Icon, label, end, rail, onNavigate, onTip }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      aria-label={rail ? label : undefined}
      className={({ isActive }) => `nav-item${isActive ? " active" : ""}${rail ? " rail" : ""}`}
      onMouseEnter={(e) => onTip(label, e.currentTarget)}
      onMouseLeave={() => onTip(null)}
      onFocus={(e) => onTip(label, e.currentTarget)}
      onBlur={() => onTip(null)}
    >
      {/* Deep-orange rail marks the active page — PRD §2.1 gives the accent
          to active progress, and it survives greyscale printing. */}
      <span className="nav-rail-mark" aria-hidden="true" />
      <Icon size={18} />
      {!rail && <span className="nav-label">{label}</span>}
    </NavLink>
  );
}

function IconButton({ icon: Icon, onClick, title, className }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
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

/**
 * Label melayang untuk sidebar mode ikon.
 *
 * Di-portal ke <body> karena daftar menu menggulir sendiri: apa pun yang
 * dirender di dalamnya akan terpotong di tepi sidebar.
 */
function RailTip({ tip }) {
  if (!tip) return null;
  return createPortal(
    <div className="rail-tip" role="presentation" style={{ left: tip.x, top: tip.y }}>
      {tip.label}
    </div>,
    document.body
  );
}

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const desktop = useMediaQuery("(min-width: 981px)");

  const [railPref, setRailPref] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tip, setTip] = useState(null);
  const scrollRef = useRef(null);

  // Mode ikon hanya berlaku di desktop; di ponsel sidebar sudah berupa laci
  // yang menutup penuh, dan ikon tanpa label di sana hanya jadi tebak-tebakan.
  const rail = railPref && desktop;

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, railPref ? "1" : "0");
    } catch {
      /* penyimpanan diblokir (mode privat) — preferensi cukup berlaku sesi ini */
    }
  }, [railPref]);

  useEffect(() => {
    if (!rail) setTip(null);
  }, [rail]);

  // Laci ikut tertutup saat pindah halaman — termasuk lewat tombol Back, yang
  // tidak melewati onClick mana pun.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Halaman baru selalu dimulai dari atas. Karena yang menggulir sekarang
  // adalah panel kanan (bukan jendela), browser tidak lagi mengurus ini sendiri.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrolled(false);
  }, [pathname]);

  function tampilkanTip(label, el) {
    if (!rail || !label || !el) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTip({ label, x: r.right + 14, y: r.top + r.height / 2 });
  }

  const namaLengkap = profile?.full_name || "";
  const firstName = namaLengkap.split(" ")[0] || "...";
  const inisial = (namaLengkap || "?").charAt(0).toUpperCase();
  const jabatan = profile?.role ? roleLabel(profile.role) : "";
  const ctx = konteksHalaman(pathname);

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside
        className={`app-sidebar${sidebarOpen ? " open" : ""}${rail ? " rail" : ""}`}
        aria-label="Navigasi utama"
      >
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-mark">
              <Asterisk size={20} />
            </div>
            {!rail && (
              <div className="brand-text">
                <div className="brand-name">Zafira Property</div>
                <div className="brand-sub">CRM Properti</div>
              </div>
            )}
          </div>

          <button
            onClick={() => setRailPref((v) => !v)}
            className="sidebar-icon-btn rail-toggle"
            title={rail ? "Lebarkan menu" : "Ciutkan menu"}
            aria-label={rail ? "Lebarkan menu" : "Ciutkan menu"}
            aria-pressed={rail}
          >
            {rail ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            className="sidebar-icon-btn menu-toggle"
            aria-label="Tutup menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="app-nav">
          {visibleSections(profile).map((section, i) => (
            <div key={i}>
              {section.title &&
                (rail ? (
                  <div className="nav-divider" aria-hidden="true" />
                ) : (
                  <div className="nav-section">{section.title}</div>
                ))}
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  rail={rail}
                  onTip={tampilkanTip}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Identitas duduk di kaki sidebar, bukan di topbar: di sanalah ia tetap
            terlihat sementara isi halaman digulir, dan tombol keluar berhenti
            bersaing tempat dengan aksi-aksi yang dipakai tiap hari. */}
        <div className="sidebar-foot">
          <div className="user-card">
            <div className="user-avatar" aria-hidden="true">
              {inisial}
            </div>
            {!rail && (
              <div className="user-meta">
                <div className="user-name">{namaLengkap || "Pengguna"}</div>
                {jabatan && <div className="user-role">{jabatan}</div>}
              </div>
            )}
            <button onClick={signOut} className="sidebar-icon-btn logout-btn" title="Keluar" aria-label="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <main className="app-scroll" ref={scrollRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 6)}>
          <div className={`topbar-wrap${scrolled ? " scrolled" : ""}`}>
            <div className="topbar">
              <div className="topbar-left">
                <button onClick={() => setSidebarOpen(true)} className="menu-toggle menu-open-btn" aria-label="Buka menu">
                  <Menu size={18} />
                </button>
                <div className="topbar-heading">
                  {ctx ? (
                    <>
                      {ctx.section && <div className="topbar-eyebrow">{ctx.section}</div>}
                      <h1>{ctx.label}</h1>
                    </>
                  ) : (
                    <>
                      {jabatan && <div className="topbar-eyebrow">{jabatan}</div>}
                      <h1>Halo, {firstName}!</h1>
                    </>
                  )}
                </div>
              </div>

              <div className="topbar-actions">
                <div className="topbar-search">
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

                <TambahProspekCepat />

                <NotifBell />

                <div className="avatar-chip" title={`${namaLengkap}${jabatan ? ` — ${jabatan}` : ""}`}>
                  {inisial}
                </div>
              </div>
            </div>

            {mobileSearchOpen && (
              <div className="mobile-search">
                <GlobalSearch onNavigate={() => setMobileSearchOpen(false)} />
              </div>
            )}
          </div>

          <div className="app-content">
            <Outlet />
          </div>
        </main>
      </div>

      <RailTip tip={tip} />
    </div>
  );
}
