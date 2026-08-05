import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES } from "../../contracts/constants";
import { useAuthModal } from "../components/gx/AuthModal";
import { showToast } from "../components/gx/ui";

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const listingId = Number(id);
  const navigate = useNavigate();
  const { open } = useAuthModal();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query listing details
  const { data: item, isLoading, error } = trpc.listings.byId.useQuery(
    { id: listingId },
    { enabled: !isNaN(listingId) }
  );

  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerModalOpen, setOfferModalOpen] = useState(false);

  // Queries related listings
  const { data: related } = trpc.listings.related.useQuery(
    { gameId: item?.listing?.gameId || "", excludeId: listingId },
    { enabled: !!item?.listing?.gameId }
  );

  const startThreadMutation = trpc.chat.startThread.useMutation({
    onSuccess: () => {
      navigate("/chat");
    },
    onError: (err) => {
      showToast(err.message || "Erro ao iniciar chat.", "error");
    },
  });

  // Mutation to make an offer
  const createOfferMutation = trpc.chat.createOffer.useMutation({
    onSuccess: (res) => {
      if (res.status === "aceita") {
        showToast("Oferta aceita pelo vendedor! Adicionado ao carrinho.", "success");
        // Add to cart
        const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
        if (!cart.includes(listingId)) {
          cart.push(listingId);
          localStorage.setItem("gx_cart", JSON.stringify(cart));
        }
        window.dispatchEvent(new Event("gx_state_change"));
        navigate("/carrinho");
      } else {
        showToast("Oferta enviada e está pendente de aprovação.", "info");
      }
      setOfferModalOpen(false);
      setOfferAmount("");
      setOfferMessage("");
    },
    onError: (err) => {
      showToast(err.message || "Erro ao fazer oferta.", "error");
    },
  });

  const handleStartChat = () => {
    if (!me) {
      open("login");
      return;
    }
    if (item?.listing?.sellerId === me.id) {
      showToast("Este anúncio é seu!", "info");
      return;
    }
    startThreadMutation.mutate({
      sellerId: item.listing.sellerId,
      listingId: item.listing.id,
    });
  };

  const handleMakeOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) {
      open("login");
      return;
    }
    const amount = parseInt(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("Preço da oferta inválido.", "error");
      return;
    }
    createOfferMutation.mutate({
      listingId,
      amount,
      message: offerMessage || undefined,
    });
  };

  const addToCart = () => {
    if (!me) {
      open("login");
      return;
    }
    if (item?.listing?.sellerId === me.id) {
      showToast("Você não pode comprar o seu próprio anúncio!", "error");
      return;
    }
    try {
      const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
      if (cart.includes(listingId)) {
        showToast("Item já está no carrinho!", "info");
        return;
      }
      cart.push(listingId);
      localStorage.setItem("gx_cart", JSON.stringify(cart));
      showToast("Adicionado ao carrinho! 🛒", "success");
      window.dispatchEvent(new Event("gx_state_change"));
    } catch {
      showToast("Erro ao adicionar ao carrinho.", "error");
    }
  };

  const buyNow = () => {
    if (!me) {
      open("login");
      return;
    }
    if (item?.listing?.sellerId === me.id) {
      showToast("Você não pode comprar o seu próprio anúncio!", "error");
      return;
    }
    const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
    if (!cart.includes(listingId)) {
      cart.push(listingId);
      localStorage.setItem("gx_cart", JSON.stringify(cart));
    }
    window.dispatchEvent(new Event("gx_state_change"));
    navigate("/carrinho");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] bg-[#0F0F1A]">
        <div className="w-12 h-12 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center bg-[#0F0F1A] text-white">
        <h2 className="text-2xl font-black mb-2 text-white">Anúncio não encontrado</h2>
        <p className="text-[#9CA3C0] mb-6">O anúncio foi removido, vendido ou não existe.</p>
        <Link to="/marketplace" className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-2.5 rounded-xl transition">
          Voltar ao Marketplace
        </Link>
      </div>
    );
  }

  const { listing, seller, reviews } = item;
  const game = GAMES.find((g) => g.id === listing.gameId) || GAMES[0];
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="bg-[#0F0F1A] text-white min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-2 text-xs text-[#9CA3C0] mb-6">
          <Link to="/" className="hover:text-white">Início</Link>
          <span>/</span>
          <Link to="/marketplace" className="hover:text-white">Marketplace</Link>
          <span>/</span>
          <Link to={`/marketplace?game=${game.id}`} className="hover:text-white">{game.nome}</Link>
          <span>/</span>
          <span className="text-white truncate max-w-[200px]">{listing.title}</span>
        </div>

        {/* CONTAINER PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* COLUNA ESQUERDA: IMAGEM, DETALHES, DESCRIÇÃO, REVIEWS */}
          <div className="lg:col-span-2 space-y-6">
            {/* GALERIA DE FOTOS OU CARD DO JOGO */}
            {listing.photos && listing.photos.length > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-4 h-72 sm:h-96 rounded-3xl overflow-hidden shadow-xl border border-[#2A2A4A] relative">
                  <img src={listing.photos[0]} alt="Capa" className="w-full h-full object-cover" />
                  <span className="absolute bottom-4 right-4 bg-black/75 border border-[#2A2A4A] rounded-full px-4 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                    {game.nome}
                  </span>
                </div>
                {listing.photos.slice(1).map((photo: string, idx: number) => (
                  <div key={idx} className="col-span-2 sm:col-span-1 h-24 sm:h-32 rounded-2xl overflow-hidden border border-[#2A2A4A] shadow-md">
                    <img src={photo} alt={`Foto ${idx + 2}`} className="w-full h-full object-cover hover:scale-110 transition duration-300" />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="h-72 rounded-3xl flex items-center justify-center text-7xl relative shadow-xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${game.grad[0]}, ${game.grad[1]})`,
                }}
              >
                {game.icone}
                <span className="absolute bottom-4 right-4 bg-black/75 border border-[#2A2A4A] rounded-full px-4 py-1.5 text-xs font-bold text-white">
                  {game.nome}
                </span>
              </div>
            )}

            {/* ESPECIFICAÇÕES DA CONTA */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
              <h1 className="text-2xl font-black mb-4 text-white">{listing.title}</h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-center">
                  <div className="text-xs text-[#9CA3C0] font-semibold uppercase mb-1">Rank</div>
                  <div className="text-sm font-black text-white">{listing.rank}</div>
                </div>
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-center">
                  <div className="text-xs text-[#9CA3C0] font-semibold uppercase mb-1">Nível</div>
                  <div className="text-sm font-black text-white">{listing.level || "N/A"}</div>
                </div>
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-center">
                  <div className="text-xs text-[#9CA3C0] font-semibold uppercase mb-1">Skins</div>
                  <div className="text-sm font-black text-white">{listing.skins || "N/A"}</div>
                </div>
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-center">
                  <div className="text-xs text-[#9CA3C0] font-semibold uppercase mb-1">Horas</div>
                  <div className="text-sm font-black text-white">{listing.hours || "N/A"}</div>
                </div>
              </div>

              {/* SELOS DE DESTAQUE */}
              <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-[#2A2A4A]/50">
                <span className="bg-[#6C5CE7]/15 border border-[#6C5CE7]/30 text-[#A29BFE] rounded-xl px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5">
                  ⚡ Entrega em {listing.deliveryTime === "1h" ? "1 hora" : listing.deliveryTime === "12h" ? "12 horas" : listing.deliveryTime === "24h" ? "24 horas" : "48 horas"}
                </span>
                <span className="bg-[#00D2D3]/15 border border-[#00D2D3]/30 text-[#00D2D3] rounded-xl px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5">
                  🛡️ GameProtect™ Seguro
                </span>
              </div>

              {/* SEGURANÇA DA CONTA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#2A2A4A] text-xs">
                <div className="flex items-center gap-2 text-white">
                  <span className="text-[#00D2D3]">✔</span>
                  <span>Email alterável (Full Acesso)</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <span className={listing.tfaTransferable ? "text-[#00D2D3]" : "text-red-500"}>
                    {listing.tfaTransferable ? "✔" : "✘"}
                  </span>
                  <span>2FA transferível / desativado</span>
                </div>
              </div>
            </div>

            {/* DESCRIÇÃO COMPLETA */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
              <h3 className="text-lg font-bold mb-3 text-white">📝 Descrição do Anúncio</h3>
              <p className="text-[#9CA3C0] text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
              {listing.extras && (
                <div className="mt-4 p-4 bg-[#12122A] border border-[#2A2A4A] rounded-2xl text-xs text-[#9CA3C0]">
                  <strong className="text-white block mb-1">Observações Extras:</strong>
                  {listing.extras}
                </div>
              )}
            </div>

            {/* AVALIAÇÕES */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
              <h3 className="text-lg font-bold mb-4 text-white">💬 Avaliações deste Vendedor ({reviews?.length ?? 0})</h3>
              {reviews?.length === 0 ? (
                <p className="text-sm text-[#9CA3C0]">Este vendedor ainda não recebeu avaliações.</p>
              ) : (
                <div className="space-y-4">
                  {reviews?.map((r: any) => (
                    <div key={r.review.id} className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-white">{r.authorName || "Comprador Fictício"}</span>
                        <span className="text-[#FFD700] text-xs">{"★".repeat(r.review.rating)}</span>
                      </div>
                      <p className="text-xs text-[#9CA3C0]">"{r.review.text}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA: CHECKOUT E INFORMAÇÕES DO VENDEDOR */}
          <div className="space-y-6">
            {/* CARD DE COMPRA */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6 shadow-xl">
              <div className="text-xs font-semibold text-[#9CA3C0] uppercase mb-1">Preço final seguro</div>
              <div className="text-3xl font-black text-[#00D2D3] mb-4">{fmt(listing.price)}</div>

              <div className="space-y-2 mb-6">
                <button
                  onClick={buyNow}
                  className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-[#6C5CE7]/30"
                >
                  Comprar Agora
                </button>
                <button
                  onClick={addToCart}
                  className="w-full bg-transparent border border-[#2A2A4A] hover:bg-[#12122A] text-white font-semibold py-3 rounded-xl transition"
                >
                  Adicionar ao Carrinho 🛒
                </button>
                <button
                  onClick={() => setOfferModalOpen(true)}
                  className="w-full bg-transparent border border-[#2A2A4A] hover:bg-[#12122A] text-[#00D2D3] hover:text-white font-semibold py-3 rounded-xl transition text-sm"
                >
                  Fazer Oferta de Preço 🤝
                </button>
              </div>

              {/* SEGURANÇA */}
              <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-xs text-[#9CA3C0] space-y-2 leading-relaxed">
                <div className="flex gap-2">
                  <span>🛡️</span>
                  <span><strong>GameProtect™:</strong> O dinheiro fica seguro e só é liberado ao vendedor após sua aprovação ou em 7 dias.</span>
                </div>
                <div className="flex gap-2">
                  <span>🔒</span>
                  <span><strong>Transação Segura:</strong> Entrega garantida ou reembolso total garantido.</span>
                </div>
              </div>
            </div>

            {/* CARD DO VENDEDOR */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
              <h3 className="text-sm font-bold text-[#9CA3C0] uppercase mb-4">👤 Sobre o Vendedor</h3>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00D2D3] flex items-center justify-center font-bold text-lg text-white">
                  {seller.name[0].toUpperCase()}
                </span>
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    {seller.name}
                    {seller.verified && <span title="Verificado" className="text-[#00D2D3]">✔</span>}
                  </div>
                  <div className="text-xs text-[#9CA3C0]">Membro desde {seller.memberSince || 2026}</div>
                </div>
              </div>

              {/* TRUST BADGES DO VENDEDOR */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {seller.verified && (
                  <span className="bg-[#00D2D3]/10 border border-[#00D2D3]/35 text-[#00D2D3] rounded-lg px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 select-none">
                    🛡️ Verificado
                  </span>
                )}
                {seller.sellerSales >= 5 && (
                  <span className="bg-[#FFD700]/10 border border-[#FFD700]/35 text-[#FFD700] rounded-lg px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 select-none">
                    🏆 Vendedor Ouro
                  </span>
                )}
                {seller.sellerSales > 0 && seller.sellerSales < 5 && (
                  <span className="bg-blue-500/10 border border-blue-500/35 text-blue-400 rounded-lg px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 select-none">
                    🎖️ Vendedor Ativo
                  </span>
                )}
                {seller.sellerRating >= 4.8 && (
                  <span className="bg-green-500/10 border border-green-500/35 text-green-400 rounded-lg px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 select-none">
                    ⭐ Reputação Excelente
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6 text-center text-xs">
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-xl p-3">
                  <div className="text-[#9CA3C0] mb-0.5">Vendas concluídas</div>
                  <div className="font-black text-white text-base">{seller.sellerSales}</div>
                </div>
                <div className="bg-[#12122A] border border-[#2A2A4A] rounded-xl p-3">
                  <div className="text-[#9CA3C0] mb-0.5">Nota média</div>
                  <div className="font-black text-[#FFD700] text-base">{seller.sellerRating.toFixed(1)} ★</div>
                </div>
              </div>

              <button
                onClick={handleStartChat}
                className="w-full bg-[#12122A] hover:bg-[#1E1E35] border border-[#2A2A4A] text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
              >
                💬 Conversar com Vendedor
              </button>
            </div>
          </div>
        </div>

        {/* PRODUTOS RELACIONADOS */}
        {related && related.length > 0 && (
          <section className="mt-16">
            <h3 className="text-xl font-black mb-6 text-white">🎮 Outras contas de {game.nome}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((r: any) => (
                <div key={r.listing.id} className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-4 hover:border-[#6C5CE7] transition">
                  <Link to={`/anuncio/${r.listing.id}`} className="block h-28 bg-[#12122A] rounded-xl flex items-center justify-center text-4xl mb-3">
                    {game.icone}
                  </Link>
                  <Link to={`/anuncio/${r.listing.id}`} className="font-bold text-xs text-white line-clamp-1 hover:text-[#6C5CE7]">
                    {r.listing.title}
                  </Link>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-black text-[#00D2D3]">{fmt(r.listing.price)}</span>
                    <span className="text-[10px] text-[#9CA3C0] bg-[#12122A] px-1.5 py-0.5 rounded">{r.listing.rank}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* MODAL DE FAZER OFERTA */}
      {offerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleMakeOffer} className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-2xl relative">
            <button
              type="button"
              onClick={() => setOfferModalOpen(false)}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold mb-4 text-white">🤝 Fazer Oferta de Preço</h3>
            <p className="text-xs text-[#9CA3C0] mb-4 leading-relaxed">
              Sugira um valor menor para o vendedor. Ofertas com valor de até 80% do preço original podem ser aceitas automaticamente se o vendedor concordar!
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Preço Ofertado (R$)</label>
                <input
                  type="number"
                  required
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder="Ex: 1500"
                  className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Mensagem (Opcional)</label>
                <textarea
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Envie um recado para o vendedor..."
                  rows={3}
                  className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
                />
              </div>

              <button
                type="submit"
                disabled={createOfferMutation.isPending}
                className="w-full bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black py-3.5 rounded-xl transition disabled:opacity-50"
              >
                {createOfferMutation.isPending ? "Enviando..." : "Enviar Oferta"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
