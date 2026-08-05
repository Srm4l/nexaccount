import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES, PLATFORM_FEE_PCT } from "../../contracts/constants";
import { showToast } from "../components/gx/ui";
import { useAuthModal } from "../components/gx/AuthModal";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";

let mpInitDone = false;

export default function Carrinho() {
  const navigate = useNavigate();
  const { open } = useAuthModal();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  const [cartIds, setCartIds] = useState<number[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [insuredListingIds, setInsuredListingIds] = useState<number[]>([]);

  // Payment states
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"pix" | "card">("pix");
  const [pixData, setPixData] = useState<{ qrCodeBase64: string; qrCodeCopiaECola: string; paymentId: number } | null>(null);
  const [cardOrderIds, setCardOrderIds] = useState<number[] | null>(null);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);

  // Initialize Mercado Pago SDK
  useEffect(() => {
    if (mpInitDone) { setMpReady(true); return; }
    fetch("/api/config/mp")
      .then((r) => r.json())
      .then((data) => {
        if (data.publicKey) {
          initMercadoPago(data.publicKey, { locale: "pt-BR" });
          mpInitDone = true;
          setMpReady(true);
        }
      })
      .catch(() => {});
  }, []);

  const loadCart = () => {
    try {
      const cart = JSON.parse(localStorage.getItem("gx_cart") || "[]");
      setCartIds(cart);
    } catch {
      setCartIds([]);
    }
  };

  useEffect(() => {
    loadCart();
    window.addEventListener("gx_state_change", loadCart);
    return () => {
      window.removeEventListener("gx_state_change", loadCart);
    };
  }, []);

  const handleRemove = (id: number) => {
    const updated = cartIds.filter((cartId) => cartId !== id);
    localStorage.setItem("gx_cart", JSON.stringify(updated));
    setCartIds(updated);
    setItems((prev) => prev.filter((item) => item.listing.id !== id));
    setInsuredListingIds((prev) => prev.filter((insuredId) => insuredId !== id));
    window.dispatchEvent(new Event("gx_state_change"));
    showToast("Item removido do carrinho.", "info");
  };

  const toggleInsurance = (id: number) => {
    setInsuredListingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const checkoutMutation = trpc.orders.checkout.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("gx_cart", "[]");
      window.dispatchEvent(new Event("gx_state_change"));

      if (data.pixData) {
        setPixData(data.pixData);
        setPaymentModalOpen(false);
      } else if (data.orderIds) {
        // Card flow — pedidos criados, agora mostrar o formulário do cartão
        setCardOrderIds(data.orderIds);
      }
    },
    onError: (err) => {
      showToast(err.message || "Erro ao processar pagamento.", "error");
    },
  });

  const payWithCardMutation = trpc.orders.payWithCard.useMutation({
    onSuccess: (data) => {
      setCardProcessing(false);
      setPaymentModalOpen(false);
      setCardOrderIds(null);
      if (data.status === "approved") {
        showToast("Pagamento aprovado! 💳", "success");
        navigate("/painel-comprador");
      } else if (data.status === "in_process") {
        showToast("Pagamento em análise. Você será notificado. ⏳", "info");
        navigate("/painel-comprador");
      }
    },
    onError: (err) => {
      setCardProcessing(false);
      showToast(err.message || "Erro no pagamento com cartão.", "error");
    },
  });

  const handleCheckoutClick = () => {
    if (!me) {
      open("login");
      return;
    }
    if (cartIds.length === 0) return;

    const invalidItem = items.find(
      (i) => i.listing.sellerId === me.id || i.listing.status !== "ativo"
    );
    if (invalidItem) {
      if (invalidItem.listing.sellerId === me.id) {
        showToast("Remova os seus próprios anúncios do carrinho antes de finalizar.", "error");
      } else {
        showToast("Um ou mais anúncios não estão mais disponíveis para compra.", "error");
      }
      return;
    }

    // Abrir modal de seleção de método de pagamento
    setPaymentModalOpen(true);
    setPaymentTab("pix");
    setPixData(null);
    setCardOrderIds(null);
  };

  const handlePayWithPix = () => {
    checkoutMutation.mutate({
      listingIds: cartIds,
      insuranceListings: insuredListingIds,
      paymentMethod: "pix",
    });
  };

  const handlePayWithCard = () => {
    // Cria os pedidos primeiro, depois o formulário do cartão aparece
    checkoutMutation.mutate({
      listingIds: cartIds,
      insuranceListings: insuredListingIds,
      paymentMethod: "card",
    });
  };

  const handleCardFormSubmit = async (formData: any) => {
    if (!cardOrderIds) return;
    setCardProcessing(true);
    payWithCardMutation.mutate({
      orderIds: cardOrderIds,
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      installments: formData.installments || 1,
      issuerId: formData.issuer_id || "",
      payerEmail: formData.payer?.email || me?.email || "",
      payerIdentificationType: formData.payer?.identification?.type,
      payerIdentificationNumber: formData.payer?.identification?.number,
    });
  };

  const handleCopyPix = () => {
    if (pixData) {
      navigator.clipboard.writeText(pixData.qrCodeCopiaECola);
      showToast("Código PIX copiado!", "success");
    }
  };

  const handleItemLoaded = (itemData: any) => {
    setItems((prev) => {
      const exists = prev.some((p) => p.listing.id === itemData.listing.id);
      if (exists) return prev;
      return [...prev, itemData];
    });
  };

  const subtotal = items.reduce((acc, item) => acc + item.listing.price, 0);
  const fee = Math.round((subtotal * PLATFORM_FEE_PCT) / 100);
  const insuranceTotal = items
    .filter((item) => insuredListingIds.includes(item.listing.id))
    .reduce((acc, item) => acc + Math.round(item.listing.price * 0.1), 0);
  const total = subtotal + fee + insuranceTotal;

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white min-h-screen">
      <h1 className="text-3xl font-black mb-1">🛒 Carrinho de Compras</h1>
      <p className="text-[#9CA3C0] text-sm mb-8">Revise os anúncios selecionados antes de confirmar o checkout.</p>

      {cartIds.length === 0 ? (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-12 text-center">
          <div className="text-5xl mb-4">🛒</div>
          <h3 className="text-lg font-bold mb-1">Seu carrinho está vazio</h3>
          <p className="text-[#9CA3C0] text-sm mb-6">Navegue pelas contas de jogos no marketplace e adicione as melhores!</p>
          <Link to="/marketplace" className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-2.5 rounded-xl transition">
            Ir ao Marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LISTA DE ITENS */}
          <div className="lg:col-span-2 space-y-4">
            {cartIds.map((id) => (
              <CartItemRow
                key={id}
                id={id}
                onRemove={handleRemove}
                onLoaded={handleItemLoaded}
                isInsured={insuredListingIds.includes(id)}
                onToggleInsurance={() => toggleInsurance(id)}
              />
            ))}
          </div>

          {/* RESUMO DO PEDIDO */}
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6 h-fit shadow-xl">
            <h3 className="text-lg font-bold mb-4">Resumo do Pedido</h3>
            <div className="space-y-3 text-sm border-b border-[#2A2A4A] pb-4 mb-4">
              <div className="flex justify-between text-[#9CA3C0]">
                <span>Contas ({cartIds.length})</span>
                <span className="text-white font-semibold">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#9CA3C0]">
                <span>Taxa de Intermediação ({PLATFORM_FEE_PCT}%)</span>
                <span className="text-white font-semibold">{fmt(fee)}</span>
              </div>
              {insuranceTotal > 0 && (
                <div className="flex justify-between text-[#A29BFE]">
                  <span>Seguro Estendido (30 dias)</span>
                  <span className="text-[#A29BFE] font-semibold">{fmt(insuranceTotal)}</span>
                </div>
              )}
              <div className="text-[10px] text-[#9CA3C0] leading-relaxed">
                A taxa de intermediação garante o serviço de escrow GameProtect™, protegendo seu saldo por 7 dias.
              </div>
            </div>

            <div className="flex justify-between items-center text-lg font-black mb-6">
              <span>Total</span>
              <span className="text-[#00D2D3]">{fmt(total)}</span>
            </div>

            <button
              onClick={handleCheckoutClick}
              disabled={items.length < cartIds.length}
              className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center disabled:opacity-50"
            >
              💳 Finalizar Compra
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE PAGAMENTO */}
      {paymentModalOpen && !pixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl relative">
            <button
              type="button"
              onClick={() => { setPaymentModalOpen(false); setCardOrderIds(null); }}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-black mb-2 text-white text-center">Forma de Pagamento</h3>
            <p className="text-xs text-[#9CA3C0] mb-6 text-center">Total: <span className="text-[#00D2D3] font-bold text-base">{fmt(total)}</span></p>

            {/* TABS */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setPaymentTab("pix")}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                  paymentTab === "pix"
                    ? "bg-[#00D2D3] text-black"
                    : "bg-[#1E1E35] text-[#9CA3C0] hover:text-white border border-[#2A2A4A]"
                }`}
              >
                <span className="text-lg">📱</span> PIX
              </button>
              <button
                onClick={() => setPaymentTab("card")}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                  paymentTab === "card"
                    ? "bg-[#6C5CE7] text-white"
                    : "bg-[#1E1E35] text-[#9CA3C0] hover:text-white border border-[#2A2A4A]"
                }`}
              >
                <span className="text-lg">💳</span> Cartão
              </button>
            </div>

            {/* PIX TAB */}
            {paymentTab === "pix" && (
              <div className="text-center">
                <p className="text-sm text-[#9CA3C0] mb-4">Pague instantaneamente via PIX. O QR Code será gerado automaticamente.</p>
                <button
                  onClick={handlePayWithPix}
                  disabled={checkoutMutation.isPending}
                  className="w-full bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black py-3.5 rounded-xl transition flex items-center justify-center disabled:opacity-50"
                >
                  {checkoutMutation.isPending ? "Gerando PIX..." : "📱 Pagar com PIX"}
                </button>
              </div>
            )}

            {/* CARD TAB */}
            {paymentTab === "card" && (
              <div>
                {!cardOrderIds ? (
                  <div className="text-center">
                    <p className="text-sm text-[#9CA3C0] mb-4">Pague com cartão de crédito ou débito de forma segura.</p>
                    <button
                      onClick={handlePayWithCard}
                      disabled={checkoutMutation.isPending}
                      className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-black py-3.5 rounded-xl transition flex items-center justify-center disabled:opacity-50"
                    >
                      {checkoutMutation.isPending ? "Preparando..." : "💳 Continuar com Cartão"}
                    </button>
                  </div>
                ) : (
                  <div>
                    {mpReady ? (
                      <div className="mp-card-form">
                        <CardPayment
                          initialization={{ amount: total }}
                          onSubmit={handleCardFormSubmit}
                          customization={{
                            visual: {
                              style: { theme: "dark" as any },
                            },
                            paymentMethods: {
                              maxInstallments: 12,
                            },
                          }}
                        />
                        {cardProcessing && (
                          <div className="mt-4 text-center text-[#9CA3C0] text-sm animate-pulse">
                            Processando pagamento...
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[#9CA3C0] text-sm text-center">Carregando formulário de pagamento...</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL QR CODE PIX */}
      {pixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl relative text-center">
            <button
              type="button"
              onClick={() => navigate("/painel-comprador")}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-black mb-2 text-white">Pagamento via PIX</h3>
            <p className="text-xs text-[#9CA3C0] mb-6">Escaneie o QR Code abaixo no app do seu banco para pagar {fmt(total)}.</p>
            
            <div className="bg-white p-4 rounded-2xl inline-block mb-4 shadow-lg shadow-[#00D2D3]/20">
              <img 
                src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`} 
                alt="QR Code PIX" 
                className="w-48 h-48"
              />
            </div>

            <div className="mb-6">
              <p className="text-[11px] text-[#9CA3C0] mb-2 uppercase font-bold tracking-wider">Ou copie o código</p>
              <button
                onClick={handleCopyPix}
                className="w-full bg-[#1E1E35] border border-[#2A2A4A] hover:border-[#6C5CE7] text-white text-xs font-mono py-3 px-4 rounded-xl transition flex items-center justify-between"
              >
                <span className="truncate mr-2 text-[#9CA3C0]">{pixData.qrCodeCopiaECola.slice(0, 25)}...</span>
                <span className="text-[#6C5CE7] font-bold">COPIAR</span>
              </button>
            </div>

            <button
              onClick={() => navigate("/painel-comprador")}
              className="w-full bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black py-3.5 rounded-xl transition flex items-center justify-center"
            >
              Ver Meus Pedidos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CartItemRow({
  id,
  onRemove,
  onLoaded,
  isInsured,
  onToggleInsurance,
}: {
  id: number;
  onRemove: (id: number) => void;
  onLoaded: (data: any) => void;
  isInsured: boolean;
  onToggleInsurance: () => void;
}) {
  const { data: item, isLoading } = trpc.listings.byId.useQuery({ id }, {
    staleTime: 60000,
  });

  useEffect(() => {
    if (item) {
      onLoaded(item);
    }
  }, [item]);

  if (isLoading) {
    return (
      <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-4 flex items-center justify-center h-24">
        <div className="w-6 h-6 border-2 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!item) return null;

  const { listing, seller } = item;
  const game = GAMES.find((g) => g.id === listing.gameId) || GAMES[0];
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-14 h-14 rounded-xl bg-[#12122A] flex items-center justify-center text-3xl shrink-0">
          {game.icone}
        </div>
        <div className="min-w-0">
          <Link to={`/anuncio/${listing.id}`} className="font-bold text-white hover:text-[#8B7CF0] transition text-sm block truncate">
            {listing.title}
          </Link>
          <div className="text-xs text-[#9CA3C0] mt-0.5">
            Rank: {listing.rank} • Vendedor: {seller.name}
          </div>
          <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none text-[11px] text-[#A29BFE] hover:text-[#8B7CF0] transition w-fit">
            <input
              type="checkbox"
              checked={isInsured}
              onChange={onToggleInsurance}
              className="accent-[#6C5CE7] rounded"
            />
            <span>🛡️ Seguro Estendido 30 dias (+10%: {fmt(Math.round(listing.price * 0.1))})</span>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#2A2A4A]">
        <div className="font-black text-[#00D2D3] text-base">{fmt(listing.price)}</div>
        <button
          onClick={() => onRemove(listing.id)}
          className="text-[#9CA3C0] hover:text-red-400 text-lg transition p-1"
          title="Remover do carrinho"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
