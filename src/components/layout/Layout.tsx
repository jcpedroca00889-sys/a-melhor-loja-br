import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import CartDrawer from "@/components/cart/CartDrawer";
import SearchOverlay from "@/components/search/SearchOverlay";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";
import { Toaster } from "@/components/feedback/Toast";

/* ============================================================
   LAYOUT — shell global: Header + conteúdo + Footer + overlays
   ============================================================ */

export default function Layout() {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      {/* Overlays globais */}
      <CartDrawer />
      <SearchOverlay />
      <Toaster />
    </div>
  );
}
