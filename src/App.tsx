import { Routes, Route, useLocation } from "react-router";
import { useEffect } from "react";
import { Header } from "@/components/gx/Header";
import { Footer } from "@/components/gx/Footer";
import { ToastHost } from "@/components/gx/ui";
import Home from "@/pages/Home";
import Marketplace from "@/pages/Marketplace";
import ListingDetail from "@/pages/ListingDetail";
import Vender from "@/pages/Vender";
import PainelVendedor from "@/pages/PainelVendedor";
import PainelComprador from "@/pages/PainelComprador";
import Carrinho from "@/pages/Carrinho";
import Favoritos from "@/pages/Favoritos";
import Chat from "@/pages/Chat";
import NotFound from "@/pages/NotFound";
import Admin from "@/pages/Admin";
import { useGames } from "@/hooks/useGames";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  useGames();
  return (
    <div className="min-h-screen bg-gx-bg text-white">
      <ScrollToTop />
      <Header />
      <main className="min-h-[70vh]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/anuncio/:id" element={<ListingDetail />} />
          <Route path="/vender" element={<Vender />} />
          <Route path="/editar/:id" element={<Vender />} />
          <Route path="/painel-vendedor" element={<PainelVendedor />} />
          <Route path="/painel-comprador" element={<PainelComprador />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route path="/favoritos" element={<Favoritos />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <ToastHost />
    </div>
  );
}
