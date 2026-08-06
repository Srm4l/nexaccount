import { useState, useEffect } from "react";
import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES, ESCROW_STEPS, isOrderPaid, orderStatusInfo } from "../../contracts/constants";
import { showToast } from "../components/gx/ui";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";

let mpInitDone = false;

export default function PainelComprador() {
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query buyer purchases
  const { data: purchases, isLoading } = trpc.orders.myPurchases.useQuery(undefined, {
    enabled: !!me,
  });

  const [disputeOrderId, setDisputeOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  // Payment states
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"pix" | "card">("pix");
  const [pixData, setPixData] = useState<{ qrCodeBase64: string; qrCodeCopiaECola: string; paymentId: number } | null>(null);
  const [orderToPay, setOrderToPay] = useState<any>(null);
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

  const generatePixMutation = trpc.orders.generatePix.useMutation({
    onSuccess: (data) => {
      setPixData(data.pixData);
    },
    onError: (err) => {
      showToast(err.message || "Erro ao gerar PIX.", "error");
    }
  });

  const payWithCardMutation = trpc.orders.payWithCard.useMutation({
    onSuccess: (data) => {
      setCardProcessing(false);
      setPaymentModalOpen(false);
      setOrderToPay(null);
      if (data.status === "approved") {
        showToast("Pagamento aprovado! 💳", "success");
        utils.orders.myPurchases.invalidate();
      } else if (data.status === "in_process") {
        showToast("Pagamento em análise. Você será notificado. ⏳", "info");
        utils.orders.myPurchases.invalidate();
      }
    },
    onError: (err) => {
      setCardProcessing(false);
      showToast(err.message || "Erro no pagamento com cartão.", "error");
    },
  });

  const handlePayClick = (order: any) => {
    setOrderToPay(order);
    setPaymentModalOpen(true);
    setPaymentTab("pix");
    setPixData(null);
  };

  const handlePayWithPix = () => {
    if (orderToPay) {
      generatePixMutation.mutate({ orderId: orderToPay.id });
    }
  };

  const handleCardFormSubmit = async (formData: any) => {
    if (!orderToPay) return;
    setCardProcessing(true);
    payWithCardMutation.mutate({
      orderIds: [orderToPay.id],
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      installments: formData.installments || 1,
      issuerId: formData.issuer_id || "",
      payerEmail: formData.payer?.email || me?.email || "",
      payerIdentificationType: formData.payer?.identification?.type,
      payerIdentificationNumber: formData.payer?.identification?.number,
    });
  };

  const confirmReceiptMutation = trpc.orders.confirmReceipt.useMutation({
    onSuccess: () => {
      showToast("Recebimento confirmado! Obrigado por comprar na ContaGamer. 💚", "success");
      utils.orders.myPurchases.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao confirmar recebimento.", "error"),
  });

  const openDisputeMutation = trpc.orders.openDispute.useMutation({
    onSuccess: () => {
      showToast("Disputa aberta com sucesso. A mediação analisará o caso.", "info");
      setDisputeOrderId(null);
      setDisputeReason("");
      utils.orders.myPurchases.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao abrir disputa.", "error"),
  });

  const handleConfirmReceipt = (orderId: number) => {
    if (confirm("Você revisou a conta e alterou todos os dados de segurança? Esta ação confirmará o recebimento e o saldo do vendedor será liberado após o prazo de garantia/retenção (20 dias).")) {
      confirmReceiptMutation.mutate({ orderId });
    }
  };

  const handleOpenDisputeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeOrderId) return;
    if (disputeReason.length < 10) {
      showToast("Descreva o motivo detalhadamente (mínimo de 10 caracteres).", "error");
      return;
    }
    openDisputeMutation.mutate({
      orderId: disputeOrderId,
      reason: disputeReason,
    });
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">📦</div>
        <h2 className="text-xl font-bold mb-2">Acesse suas Compras</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Faça login para acompanhar a entrega das suas contas de jogos e interagir com o suporte/vendedores.
        </p>
        <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white min-h-screen">
      <h1 className="text-3xl font-black mb-1">📦 Minhas Compras</h1>
      <p className="text-[#9CA3C0] text-sm mb-8">Acompanhe a entrega, inspecione as contas compradas e libere os pagamentos.</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
        </div>
      ) : purchases?.length === 0 ? (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-12 text-center">
          <div className="text-5xl mb-4">🛒</div>
          <h3 className="text-lg font-bold mb-1">Nenhuma compra registrada</h3>
          <p className="text-[#9CA3C0] text-sm mb-6">Explore o marketplace e encontre a conta de jogo ideal para você.</p>
          <Link to="/marketplace" className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-2.5 rounded-xl transition">
            Ir ao Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {purchases?.map((p: any) => {
            const game = GAMES.find((g) => g.id === p.listing.gameId) || GAMES[0];
            const paid = isOrderPaid(p.order);
            const statusInfo = orderStatusInfo(p.order);
            return (
              <div key={p.order.id} className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#2A2A4A]">
                  <div>
                    <span className="font-bold text-white text-base">Pedido #GX-{4000 + p.order.id}</span>
                    <span className="text-xs text-[#9CA3C0] ml-2">Vendedor: {p.sellerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#9CA3C0]">Status:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusInfo.chip}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#12122A] flex items-center justify-center text-2xl shrink-0">
                    {game.icone}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white text-sm truncate">{p.listing.title}</div>
                    <div className="text-xs text-[#9CA3C0] mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        Valor total pago: {fmt(p.order.total)} (Preço: {fmt(p.order.price)} + taxas: {fmt(p.order.fee)}
                        {p.order.hasInsurance ? ` + seguro: ${fmt(p.order.insurancePrice)}` : ""})
                      </span>
                      {p.order.hasInsurance && (
                        <span className="bg-[#A29BFE]/10 border border-[#A29BFE]/35 text-[#A29BFE] rounded-lg px-2 py-0.5 text-[10px] font-bold select-none">
                          🛡️ Proteção Estendida (30 dias)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* PROGRESSO DO ESCROW */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#9CA3C0] uppercase">Estágio de Entrega</div>
                  <div className="grid grid-cols-4 gap-1.5 text-[10px] sm:text-xs text-center font-bold">
                    {ESCROW_STEPS.map((step, idx) => {
                      const num = idx + 1;
                      const active = paid && p.order.stage >= num;
                      return (
                        <div
                          key={idx}
                          className={`py-2 rounded-lg border transition ${
                            active
                              ? "bg-[#6C5CE7]/15 border-[#6C5CE7] text-white"
                              : "bg-[#12122A]/30 border-[#2A2A4A] text-[#9CA3C0]"
                          }`}
                        >
                          {step}
                        </div>
                      );
                    })}
                  </div>
                  {!paid && p.order.status === "aguardando" && (
                    <div className="flex flex-col gap-3 sm:flex-row items-center justify-between text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                      <div>
                        ⏳ O pagamento ainda não foi confirmado. Finalize o pagamento para que o vendedor libere a conta.
                      </div>
                      <button
                        onClick={() => handlePayClick(p.order)}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-lg transition whitespace-nowrap"
                      >
                        💳 Pagar Agora
                      </button>
                    </div>
                  )}
                </div>

                {/* AÇÕES DE SUPORTE E ENTREGA */}
                {paid && p.order.status !== "concluida" && p.order.status !== "cancelada" && (
                  <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-[#2A2A4A]/50">
                    <Link
                      to="/chat"
                      className="bg-[#12122A] hover:bg-[#1E1E35] border border-[#2A2A4A] text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center justify-center"
                    >
                      💬 Conversar
                    </Link>
                    {p.order.status !== "disputa" && (
                      <>
                        <button
                          onClick={() => {
                            setDisputeOrderId(p.order.id);
                            setDisputeReason("");
                          }}
                          className="bg-transparent hover:bg-red-500/10 text-red-400 border border-red-500/25 font-bold text-xs px-4 py-2 rounded-lg transition"
                        >
                          ⚠️ Abrir Disputa
                        </button>
                        <button
                          onClick={() => handleConfirmReceipt(p.order.id)}
                          className="bg-green-600 hover:bg-green-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                        >
                          ✔ Confirmar Recebimento
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DIALOG DE DISPUTA */}
      {disputeOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleOpenDisputeSubmit} className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-2xl relative">
            <button
              type="button"
              onClick={() => setDisputeOrderId(null)}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold mb-4 text-white">⚖️ Abrir Disputa / Mediação</h3>
            <p className="text-xs text-[#9CA3C0] mb-4 leading-relaxed">
              Use este recurso caso o vendedor não entregue a conta correta, ou se os dados forem alterados ou bloqueados durante os 7 dias de inspeção. Descreva detalhadamente o ocorrido.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Motivo da Disputa</label>
                <textarea
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Ex: O vendedor entregou a conta, mas a senha está errada e ele não responde no chat..."
                  rows={4}
                  className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
                />
                <span className="text-[10px] text-[#9CA3C0] mt-1 block">Mínimo de 10 caracteres.</span>
              </div>

              <button
                type="submit"
                disabled={openDisputeMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-3.5 rounded-xl transition disabled:opacity-50"
              >
                {openDisputeMutation.isPending ? "Processando..." : "Abrir Reclamação Oficial"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE PAGAMENTO */}
      {paymentModalOpen && !pixData && orderToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl relative">
            <button
              type="button"
              onClick={() => { setPaymentModalOpen(false); setOrderToPay(null); }}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-black mb-2 text-white text-center">Forma de Pagamento</h3>
            <p className="text-xs text-[#9CA3C0] mb-6 text-center">Total: <span className="text-[#00D2D3] font-bold text-base">{fmt(orderToPay.total)}</span></p>

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
                  disabled={generatePixMutation.isPending}
                  className="w-full bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black py-3.5 rounded-xl transition flex items-center justify-center disabled:opacity-50"
                >
                  {generatePixMutation.isPending ? "Gerando PIX..." : "📱 Pagar com PIX"}
                </button>
              </div>
            )}

            {/* CARD TAB */}
            {paymentTab === "card" && (
              <div>
                {mpReady ? (
                  <div className="mp-card-form">
                    <CardPayment
                      initialization={{ amount: orderToPay.total }}
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
        </div>
      )}

      {/* MODAL QR CODE PIX */}
      {pixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl relative text-center">
            <button
              type="button"
              onClick={() => { setPixData(null); setPaymentModalOpen(false); setOrderToPay(null); }}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-black mb-2 text-white">Pagamento via PIX</h3>
            <p className="text-xs text-[#9CA3C0] mb-6">Escaneie o QR Code abaixo no app do seu banco para pagar.</p>
            
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
                onClick={() => {
                  navigator.clipboard.writeText(pixData.qrCodeCopiaECola);
                  showToast("Código PIX copiado!", "success");
                }}
                className="w-full bg-[#1E1E35] border border-[#2A2A4A] hover:border-[#6C5CE7] text-white text-xs font-mono py-3 px-4 rounded-xl transition flex items-center justify-between"
              >
                <span className="truncate mr-2 text-[#9CA3C0]">{pixData.qrCodeCopiaECola.slice(0, 25)}...</span>
                <span className="text-[#6C5CE7] font-bold">COPIAR</span>
              </button>
            </div>
            
            <button
              onClick={() => { setPixData(null); setPaymentModalOpen(false); setOrderToPay(null); utils.orders.myPurchases.invalidate(); }}
              className="w-full bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black py-3.5 rounded-xl transition flex items-center justify-center"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
