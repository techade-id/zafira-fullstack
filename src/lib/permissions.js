/**
 * Frontend mirror of the RLS policies in migrations 008, 011 and 012.
 *
 * The database is the authority — every rule here is also enforced server-side.
 * This module exists so a user is never shown a control that is certain to be
 * rejected: a read-only Supervisor should not see a "Hapus" button at all.
 *
 * When a policy changes in any of those migrations, change the matching entry
 * here too — `supabase/tests/` checks the database side, not this mirror.
 */

/** Retired role names still present in the enum, mapped to their replacement. */
const LEGACY = {
  sales_agent: "sales",
  marketing: "sales",
  administrasi: "admin_marketing",
  supervisor: "supervisor_marketing",
  manager: "pengawas",
};

export const ROLES = ["sales", "admin_marketing", "finance", "supervisor_marketing", "pengawas", "admin", "tim_lapangan"];

export const ROLE_LABELS = {
  sales: "Sales",
  admin_marketing: "Admin Marketing",
  finance: "Finance",
  supervisor_marketing: "Supervisor Marketing",
  pengawas: "Pengawas",
  admin: "Admin Sistem",
  tim_lapangan: "Tim Lapangan",
};

export const ROLE_DESCRIPTIONS = {
  sales: "Input prospek, kelola leads, profil konsumen sampai Booking Fee",
  admin_marketing: "Pemberkasan KPR, koordinasi bank, SP3K hingga Akad",
  finance: "Verifikasi pembayaran, kuitansi resmi, piutang DP dan talangan",
  supervisor_marketing: "Monitoring performa tim — hanya baca",
  pengawas: "Audit sistem, log aktivitas, dan konfigurasi bisnis",
  admin: "Akses penuh, satu-satunya yang dapat mengubah role pengguna",
  tim_lapangan: "Progres dan laporan pekerjaan lapangan",
};

export function roleOf(profile) {
  const raw = profile?.role || "";
  return LEGACY[raw] || raw;
}

export function roleLabel(role) {
  const key = LEGACY[role] || role;
  return ROLE_LABELS[key] || key;
}

/** Monitoring roles: they see everything and change nothing. */
export function isReadOnly(profile) {
  const r = roleOf(profile);
  return r === "supervisor_marketing" || r === "pengawas";
}

/**
 * Who may write what. Mirrors the WITH CHECK clauses in the migrations.
 * Pengawas keeps configuration authority (REVISI §2.1) while staying read-only
 * over the transaction cycle (PRD §3.1).
 */
const WRITE_MATRIX = {
  lead: ["admin", "sales"],
  customer: ["admin", "sales", "admin_marketing"],
  kpr: ["admin", "admin_marketing", "sales"],
  document: ["admin", "admin_marketing", "sales"],
  payment: ["admin", "finance", "admin_marketing", "sales"],
  payment_verify: ["admin", "finance"],
  cancellation: ["admin", "admin_marketing", "finance", "sales"],
  followup: ["admin", "sales", "admin_marketing", "finance"],
  config: ["admin", "pengawas"],
  target: ["admin", "pengawas"],
  project: ["admin", "pengawas", "admin_marketing"],
  contractor: ["admin", "pengawas", "admin_marketing"],
  ads: ["admin", "pengawas", "admin_marketing"],
  // Pengawas mengaudit, tidak mengerjakan unit — cocokkan dengan
  // field_reports_write pada migration_012.
  field: ["admin", "admin_marketing", "tim_lapangan"],
  complaint: ["admin", "pengawas", "admin_marketing", "sales", "finance", "tim_lapangan"],
  agent_role: ["admin"],
  // Rencana kerja: project_tasks_write juga mengizinkan tim lapangan.
  task: ["admin", "pengawas", "admin_marketing", "tim_lapangan"],
  // Deletions are narrower than edits — these mirror the FOR DELETE policies.
  customer_delete: ["admin"],
  payment_delete: ["admin", "finance"],
  document_delete: ["admin", "admin_marketing"],
  cancellation_delete: ["admin"],
  complaint_delete: ["admin", "admin_marketing"],
  project_delete: ["admin", "pengawas"],
};

export function canWrite(profile, subject) {
  const allowed = WRITE_MATRIX[subject];
  if (!allowed) return false;
  return allowed.includes(roleOf(profile));
}

/**
 * Handover Hard-Lock (PRD §3.2). Once Finance has verified the Booking Fee
 * receipt, the customer profile and its KPR/documents stop being editable by
 * Sales — Admin Marketing takes over. Follow-up notes stay open, which is why
 * they are a separate subject.
 */
export function isLocked(customer) {
  return Boolean(customer?.locked_at);
}

export function canEditCustomer(profile, customer) {
  if (!canWrite(profile, "customer")) return false;
  if (roleOf(profile) === "sales" && isLocked(customer)) return false;
  return true;
}

export function canEditBerkas(profile, customer) {
  if (!canWrite(profile, "kpr")) return false;
  if (roleOf(profile) === "sales" && isLocked(customer)) return false;
  return true;
}

/** Explanation shown in the lock banner, so the block never looks like a bug. */
export function lockReason(customer) {
  if (!isLocked(customer)) return "";
  const when = new Date(customer.locked_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  return `Kuitansi Booking Fee sudah diverifikasi Finance pada ${when}. Berkas dan profil konsumen ini kini menjadi tanggung jawab Admin Marketing.`;
}

/**
 * Which pages each role sees. A route missing from the list is also blocked by
 * ProtectedRoute, so hiding the menu item is not the only defence.
 */
const ALL_ROUTES = [
  "/",
  "/prospek",
  "/konsumen",
  "/pembayaran",
  "/pembatalan",
  "/reminder",
  "/target",
  "/proyek",
  "/siteplan",
  "/kontraktor",
  "/rencana-proyek",
  "/lapangan",
  "/komplain",
  "/laporan",
  "/iklan",
  "/data-agen",
  "/pengaturan-bisnis",
  "/log-aktivitas",
  "/cari",
];

const ROUTES_BY_ROLE = {
  admin: ALL_ROUTES,
  pengawas: ALL_ROUTES,
  supervisor_marketing: ALL_ROUTES.filter((r) => !["/data-agen", "/pengaturan-bisnis", "/log-aktivitas"].includes(r)),
  sales: ["/", "/prospek", "/konsumen", "/pembayaran", "/pembatalan", "/reminder", "/target", "/siteplan", "/komplain", "/cari"],
  admin_marketing: [
    "/",
    "/prospek",
    "/konsumen",
    "/pembayaran",
    "/pembatalan",
    "/reminder",
    "/proyek",
    "/siteplan",
    "/kontraktor",
    "/rencana-proyek",
    "/lapangan",
    "/komplain",
    "/laporan",
    "/iklan",
    "/cari",
  ],
  finance: ["/", "/konsumen", "/pembayaran", "/pembatalan", "/laporan", "/cari"],
  tim_lapangan: ["/", "/lapangan", "/rencana-proyek", "/komplain", "/siteplan", "/cari"],
};

export function allowedRoutes(profile) {
  return ROUTES_BY_ROLE[roleOf(profile)] || ROUTES_BY_ROLE.sales;
}

export function canVisit(profile, path) {
  return allowedRoutes(profile).includes(path);
}
