import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute, { RoleRoute } from "./routes/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DaftarPage from "./pages/DaftarPage";
import DashboardPage from "./pages/DashboardPage";
import ProspekPage from "./pages/ProspekPage";
import PembayaranPage from "./pages/PembayaranPage";
import KonsumenPage from "./pages/KonsumenPage";
import KonsumenDetailPage from "./pages/KonsumenDetailPage";
import PembatalanPage from "./pages/PembatalanPage";
import ProyekPage from "./pages/ProyekPage";
import SiteplanPage from "./pages/SiteplanPage";
import KontraktorPage from "./pages/KontraktorPage";
import RencanaProyekPage from "./pages/RencanaProyekPage";
import KomplainPage from "./pages/KomplainPage";
import LaporanPage from "./pages/LaporanPage";
import IklanPage from "./pages/IklanPage";
import ReminderPage from "./pages/ReminderPage";
import TargetPage from "./pages/TargetPage";
import DataAgenPage from "./pages/DataAgenPage";
import PengaturanBisnisPage from "./pages/PengaturanBisnisPage";
import PencarianPage from "./pages/PencarianPage";
import LogAktivitasPage from "./pages/LogAktivitasPage";
import LapanganPage from "./pages/LapanganPage";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/daftar" element={<DaftarPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />

            {/* Kartu konsumen 360°. Rute bersarang, jadi canVisit() harus
                mencocokkan awalan — lihat permissions.js. */}
            <Route
              path="konsumen/:id"
              element={
                <RoleRoute>
                  <KonsumenDetailPage />
                </RoleRoute>
              }
            />

            {[
              ["prospek", <ProspekPage />],
              ["pembayaran", <PembayaranPage />],
              ["konsumen", <KonsumenPage />],
              ["pembatalan", <PembatalanPage />],
              ["proyek", <ProyekPage />],
              ["siteplan", <SiteplanPage />],
              ["kontraktor", <KontraktorPage />],
              ["rencana-proyek", <RencanaProyekPage />],
              ["lapangan", <LapanganPage />],
              ["komplain", <KomplainPage />],
              ["laporan", <LaporanPage />],
              ["iklan", <IklanPage />],
              ["reminder", <ReminderPage />],
              ["target", <TargetPage />],
              ["data-agen", <DataAgenPage />],
              ["pengaturan-bisnis", <PengaturanBisnisPage />],
              ["log-aktivitas", <LogAktivitasPage />],
              ["cari", <PencarianPage />],
            ].map(([path, element]) => (
              <Route key={path} path={path} element={<RoleRoute>{element}</RoleRoute>} />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
