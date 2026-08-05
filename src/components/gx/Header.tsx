import { Link, useLocation } from "react-router";
import { trpc } from "../../providers/trpc";
import { useAuthModal } from "./AuthModal";
import { useState, useEffect } from "react";
import { showToast } from "./ui";

export function Header() {
  const { open } = useAuthModal();
  const { pathname } = useLocation();
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      showToast("Sessão encerrada.", "info");
      // Limpa os dados do usuário do cache imediatamente (sem esperar re-fetch)
      utils.auth.me.setData(undefined, null as any);
      utils.auth.me.invalidate();
      // Limpa também o carrinho e favoritos locais
      localStorage.setItem("gx_cart", "[]");
      window.dispatchEvent(new Event("gx_state_change"));
    },
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [favCount, setFavCount] = useState(0);

  // Sync with localStorage for cart and favorites
  const updateCounts = () => {
    try {
      const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
      setCartCount(cart.length);
      const favs = JSON.parse(localStorage.getItem("gx_favs") || "[]");
      setFavCount(favs.length);
    } catch {
      setCartCount(0);
      setFavCount(0);
    }
  };

  useEffect(() => {
    updateCounts();
    window.addEventListener("storage", updateCounts);
    window.addEventListener("gx_state_change", updateCounts);
    return () => {
      window.removeEventListener("storage", updateCounts);
      window.removeEventListener("gx_state_change", updateCounts);
    };
  }, []);

  const handleLogout = () => {
    logoutMutation.mutate();
    setDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0F0F1A]/85 backdrop-blur-lg border-b border-[#2A2A4A]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🎮</span>
          <span className="font-black text-lg tracking-tight text-white">
            Conta<span className="bg-gradient-to-r from-[#6C5CE7] to-[#00D2D3] bg-clip-text text-transparent">Gamer</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
          <Link
            to="/"
            className={`px-3 py-2 rounded-lg hover:bg-[#17172B] transition text-white ${
              pathname === "/" ? "bg-[#17172B] border border-[#2A2A4A]" : ""
            }`}
          >
            Início
          </Link>
          <Link
            to="/marketplace"
            className={`px-3 py-2 rounded-lg hover:bg-[#17172B] transition text-white ${
              pathname === "/marketplace" ? "bg-[#17172B] border border-[#2A2A4A]" : ""
            }`}
          >
            Marketplace
          </Link>
          <Link
            to="/vender"
            className={`px-3 py-2 rounded-lg hover:bg-[#17172B] transition text-white ${
              pathname === "/vender" ? "bg-[#17172B] border border-[#2A2A4A]" : ""
            }`}
          >
            Vender
          </Link>
          <Link
            to="/painel-vendedor"
            className={`px-3 py-2 rounded-lg hover:bg-[#17172B] transition text-white ${
              pathname === "/painel-vendedor" ? "bg-[#17172B] border border-[#2A2A4A]" : ""
            }`}
          >
            Painel Vendedor
          </Link>
          <Link
            to="/painel-comprador"
            className={`px-3 py-2 rounded-lg hover:bg-[#17172B] transition text-white ${
              pathname === "/painel-comprador" ? "bg-[#17172B] border border-[#2A2A4A]" : ""
            }`}
          >
            Minhas Compras
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/favoritos" className="relative p-2 rounded-lg hover:bg-[#17172B] transition text-lg text-white">
            ❤️
            {favCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#6C5CE7] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {favCount}
              </span>
            )}
          </Link>
          <Link to="/carrinho" className="relative p-2 rounded-lg hover:bg-[#17172B] transition text-lg text-white">
            🛒
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#FFD700] text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>

          {me ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 bg-[#17172B] border border-[#2A2A4A] rounded-full pl-1 pr-3 py-1 hover:border-[#6C5CE7] transition text-white"
              >
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00D2D3] flex items-center justify-center text-sm font-bold">
                  {(me.name || "U")[0].toUpperCase()}
                </span>
                <span className="text-sm font-semibold hidden sm:block max-w-[100px] truncate">
                  {me.name}
                </span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1E1E35] border border-[#2A2A4A] rounded-xl shadow-2xl overflow-hidden text-sm z-50">
                  <Link
                    to="/painel-comprador"
                    onClick={() => setDropdownOpen(false)}
                    className="block px-4 py-2.5 hover:bg-[#17172B] text-white"
                  >
                    📦 Minhas Compras
                  </Link>
                  <Link
                    to="/painel-vendedor"
                    onClick={() => setDropdownOpen(false)}
                    className="block px-4 py-2.5 hover:bg-[#17172B] text-white"
                  >
                    📊 Painel Vendedor
                  </Link>
                  <Link
                    to="/chat"
                    onClick={() => setDropdownOpen(false)}
                    className="block px-4 py-2.5 hover:bg-[#17172B] text-white"
                  >
                    💬 Mensagens
                  </Link>
                  {me.role === "admin" && (
                    <Link
                      to="/admin"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2.5 hover:bg-[#17172B] text-gold"
                    >
                      👑 Painel Admin
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#17172B] text-red-400 border-t border-[#2A2A4A]"
                  >
                    🚪 Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => open("login")}
              className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white text-sm font-bold px-4 py-2 rounded-full transition shadow-lg shadow-[#6C5CE7]/30"
            >
              Entrar
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-[#17172B] text-lg text-white"
          >
            ☰
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#2A2A4A] px-4 py-3 flex flex-col gap-1 text-sm font-medium bg-[#0F0F1A]">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            🏠 Início
          </Link>
          <Link to="/marketplace" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            🛍️ Marketplace
          </Link>
          <Link to="/vender" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            💰 Vender
          </Link>
          <Link to="/painel-vendedor" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            📊 Painel Vendedor
          </Link>
          <Link to="/painel-comprador" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            📦 Minhas Compras
          </Link>
          <Link to="/chat" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-[#17172B] text-white">
            💬 Chat
          </Link>
        </div>
      )}
    </header>
  );
}
