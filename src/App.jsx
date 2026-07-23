import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProspekPage from "./pages/ProspekPage";
import PembayaranPage from "./pages/PembayaranPage";
import ComingSoonPage from "./pages/ComingSoonPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="prospek" element={<ProspekPage />} />
            <Route path="pembayaran" element={<PembayaranPage />} />

            <Route
              path="konsumen"
              element={
                <ComingSoonPage
                  title="Konsumen"
                  description="Data konsumen, progres pembelian, dan dokumen administrasi"
                  plannedFields={["Data customer & unit terkait", "Status & lama proses per konsumen", "Dokumen (KTP, KK, NPWP, Akad) dengan status verifikasi", "Riwayat komunikasi & catatan internal"]}
                />
              }
            />
            <Route
              path="pembatalan"
              element={<ComingSoonPage title="Pembatalan" description="Riwayat konsumen cancel beserta alasannya" plannedFields={["Alasan & detail pembatalan", "Siapa yang memproses", "Tanggal pembatalan"]} />}
            />
            <Route
              path="proyek"
              element={<ComingSoonPage title="Proyek" description="Kelola proyek/perumahan — bisa tambah proyek baru selain Griya Zafira" plannedFields={["Nama & lokasi proyek", "Upload gambar siteplan", "Daftar unit per proyek"]} />}
            />
            <Route
              path="siteplan"
              element={<ComingSoonPage title="Siteplan Digital" description="Peta unit interaktif — klik unit untuk lihat konsumen, progres, dan info bangunan" plannedFields={["Overlay pin unit di atas gambar siteplan", "Warna status: tersedia/booking/terjual", "Klik unit → detail konsumen + progres pembangunan"]} />}
            />
            <Route
              path="kontraktor"
              element={<ComingSoonPage title="Kontraktor" description="Data kontraktor dan evaluasi/filter performa" plannedFields={["Data kontraktor & spesialisasi", "Skor evaluasi per proyek", "Filter kontraktor berdasarkan rating"]} />}
            />
            <Route
              path="monitoring-lapangan"
              element={<ComingSoonPage title="Monitoring Lapangan" description="Progres pembangunan per unit dan laporan tim lapangan" plannedFields={["Timeline & progress percent per unit", "Laporan lapangan (foto sebelum/sesudah, kendala, solusi)", "Status: belum mulai / berjalan / terlambat / selesai"]} />}
            />
            <Route
              path="komplain"
              element={<ComingSoonPage title="Komplain" description="Pengelolaan komplain dari konsumen maupun admin" plannedFields={["Input komplain + kategori + prioritas", "Assignment PIC & status", "Riwayat & dokumentasi penyelesaian"]} />}
            />
            <Route
              path="laporan"
              element={<ComingSoonPage title="Laporan" description="Laporan sales, customer, closing, project, tim lapangan, dan export Excel" plannedFields={["Laporan sales & closing", "Laporan progress project", "Export ke Excel"]} />}
            />
            <Route
              path="iklan"
              element={<ComingSoonPage title="Digital Ads" description="Analisis performa iklan/konten digital yang menghasilkan prospek" plannedFields={["Spend, impressions, klik per platform", "Leads generated per campaign", "Tren performa dari waktu ke waktu"]} />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
