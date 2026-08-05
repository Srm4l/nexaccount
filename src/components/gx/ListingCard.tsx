import { Link, useNavigate } from "react-router";
import { trpc } from "../../providers/trpc";
import { showToast } from "./ui";
import { useState, useEffect } from "react";
import { GAMES, TIER_LABEL } from "../../../contracts/constants";
import { useAuthModal } from "./AuthModal";

export function ListingCard({ item, delay = 0, onFavToggle }: { item: any; delay?: number; onFavToggle?: () => void }) {
  const navigate = useNavigate();
  const { open } = useAuthModal();
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  const { listing, seller } = item;
  const game = GAMES.find((g) => g.id === listing.gameId) || GAMES[0];

  const [isFav, setIsFav] = useState(false);

  const { data: favIds } = trpc.orders.favoritesIds.useQuery(undefined, {
    enabled: !!me,
  });

  useEffect(() => {
    if (favIds) {
      setIsFav(favIds.includes(listing.id));
    }
  }, [favIds, listing.id]);

  const toggleFavMutation = trpc.orders.toggleFavorite.useMutation({
    onSuccess: (res) => {
      setIsFav(res.favorited);
      showToast(res.favorited ? "Adicionado aos favoritos ❤️" : "Removido dos favoritos", "info");
      utils.orders.favoritesIds.invalidate();
      if (onFavToggle) onFavToggle();
      window.dispatchEvent(new Event("gx_state_change"));
    },
  });

  const toggleFav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me) {
      open("login");
      return;
    }
    toggleFavMutation.mutate({ listingId: listing.id });
  };

  const addToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
      if (cart.includes(listing.id)) {
        showToast("Item já está no carrinho!", "info");
        return;
      }
      cart.push(listing.id);
      localStorage.setItem("gx_cart", JSON.stringify(cart));
      showToast("Adicionado ao carrinho! 🛒", "success");
      window.dispatchEvent(new Event("gx_state_change"));
    } catch {
      showToast("Erro ao adicionar ao carrinho.", "error");
    }
  };

  const buyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me) {
      open("login");
      return;
    }
    // Add to cart and navigate to checkout/cart page
    const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
    if (!cart.includes(listing.id)) {
      cart.push(listing.id);
      localStorage.setItem("gx_cart", JSON.stringify(cart));
    }
    window.dispatchEvent(new Event("gx_state_change"));
    navigate("/carrinho");
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const renderStars = (rating: number) => {
    const stars = [];
    const rounded = Math.round(rating);
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= rounded ? "text-[#FFD700]" : "text-gray-600"}>
          ★
        </span>
      );
    }
    return <div className="text-xs tracking-tight">{stars}</div>;
  };
  return (
    <div
      className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-[#6C5CE7]/10 hover:border-[#6C5CE7]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Link to={`/anuncio/${listing.id}`} className="block relative h-44">
        <div
          className="w-full h-full flex items-center justify-center text-5xl"
          style={{
            background: `linear-gradient(135deg, ${game.grad[0]}, ${game.grad[1]})`,
          }}
        >
          {game.icone}
        </div>
        {listing.featured && (
          <span className="absolute top-3 left-3 bg-[#FFD700] text-black text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse">
            ⭐ DESTAQUE
          </span>
        )}
        <span className="absolute top-3 right-3 bg-black/80 backdrop-blur text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#2A2A4A] text-white">
          {game.nome}
        </span>
      </Link>
      <div className="p-4">
        <Link
          to={`/anuncio/${listing.id}`}
          className="font-bold text-sm leading-snug line-clamp-2 text-white hover:text-[#8B7CF0] transition min-h-[40px]"
        >
          {listing.title}
        </Link>
        <div className="flex items-center gap-2 mt-2 text-xs text-[#9CA3C0] flex-wrap">
          <span className="bg-[#12122A] border border-[#2A2A4A] rounded px-1.5 py-0.5">{listing.rank}</span>
          {listing.level > 0 && (
            <span className="bg-[#12122A] border border-[#2A2A4A] rounded px-1.5 py-0.5">Nv. {listing.level}</span>
          )}
          {listing.skins > 0 && (
            <span className="bg-[#12122A] border border-[#2A2A4A] rounded px-1.5 py-0.5">{listing.skins} skins</span>
          )}
          {listing.deliveryTime && (
            <span className="bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 text-[#A29BFE] rounded px-1.5 py-0.5 text-[10px] font-bold">
              ⚡ {listing.deliveryTime}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xl font-black text-[#00D2D3]">{fmt(listing.price)}</div>
          {renderStars(seller.sellerRating)}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2A2A4A]">
          <div className="flex items-center gap-1.5 text-xs text-[#9CA3C0]">
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                background: seller.sellerTier === "diamante" ? "rgba(0,210,211,.15)" : seller.sellerTier === "ouro" ? "rgba(255,215,0,.15)" : seller.sellerTier === "prata" ? "rgba(192,192,192,.15)" : "rgba(205,127,50,.18)",
                color: seller.sellerTier === "diamante" ? "#00D2D3" : seller.sellerTier === "ouro" ? "#FFD700" : seller.sellerTier === "prata" ? "#d7d7e2" : "#e09b5f",
                border: seller.sellerTier === "diamante" ? "1px solid rgba(0,210,211,.55)" : seller.sellerTier === "ouro" ? "1px solid rgba(255,215,0,.55)" : seller.sellerTier === "prata" ? "1px solid rgba(192,192,192,.5)" : "1px solid rgba(205,127,50,.5)",
              }}
            >
              {TIER_LABEL[seller.sellerTier]}
            </span>
            {seller.verified && (
              <span title="Vendedor verificado" className="text-[#00D2D3]">
                ✔
              </span>
            )}
            <span className="truncate max-w-[90px]">{seller.name}</span>
          </div>
          <button onClick={toggleFav} className="text-lg hover:scale-125 transition" title="Favoritar">
            {isFav ? "❤️" : "🤍"}
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={buyNow}
            className="flex-1 bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold text-sm py-2 rounded-lg transition"
          >
            Comprar
          </button>
          <button
            onClick={addToCart}
            className="px-3 border border-[#2A2A4A] text-[#9CA3C0] hover:text-white rounded-lg transition"
            title="Adicionar ao carrinho"
          >
            🛒
          </button>
        </div>
      </div>
    </div>
  );
}
