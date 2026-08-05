import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import BackgroundFX from "@/components/background/BackgroundFX";
import Layout from "@/components/layout/Layout";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";
import { Toaster } from "@/components/feedback/Toast";
import { scrollToTop } from "@/lib/lenis";
import { useAuthStore } from "@/lib/store/auth-store";
import { useCatalogStore } from "@/lib/store/catalog-store";

/* Rotas lazy → R3F e páginas pesadas só carregam quando necessárias */
const HomePage = lazy(() => import("@/pages/HomePage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const WishlistPage = lazy(() => import("@/pages/WishlistPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    scrollToTop(true);
  }, [pathname]);
  return null;
}

export default function App() {
  /* Valida a sessão persistida (token) ao abrir o app e carrega o catálogo da API */
  useEffect(() => {
    useAuthStore.getState().restore();
    useCatalogStore.getState().load();
  }, []);

  /* Auto-refresh silencioso do catálogo a cada 30s — edições do admin
     aparecem para o usuário sem recarregar a página. */
  useEffect(() => {
    const t = setInterval(() => {
      useCatalogStore.getState().silentRefresh();
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <BrowserRouter>
      <BackgroundFX />
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageSkeleton />}>
                <HomePage />
              </Suspense>
            }
          />
          <Route
            path="produto/:slug"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <ProductPage />
              </Suspense>
            }
          />
          <Route
            path="favoritos"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <WishlistPage />
              </Suspense>
            }
          />
          <Route
            path="checkout"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <CheckoutPage />
              </Suspense>
            }
          />
          <Route
            path="entrar"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <AuthPage mode="login" />
              </Suspense>
            }
          />
          <Route
            path="criar-conta"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <AuthPage mode="register" />
              </Suspense>
            }
          />
          <Route
            path="perfil"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <ProfilePage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
