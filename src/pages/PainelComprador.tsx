import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES, ESCROW_STEPS } from "../../contracts/constants";
import { showToast } from "../components/gx/ui";

export default function PainelComprador() {
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query buyer purchases
  const { data: purchases, isLoading } = trpc.orders.myPurchases.useQuery(undefined, {
    enabled: !!me,
  });

  const [disputeOrderId, setDisputeOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

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
            return (
              <div key={p.order.id} className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#2A2A4A]">
                  <div>
                    <span className="font-bold text-white text-base">Pedido #GX-{4000 + p.order.id}</span>
                    <span className="text-xs text-[#9CA3C0] ml-2">Vendedor: {p.sellerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#9CA3C0]">Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        p.order.status === "concluida"
                          ? "bg-green-500/10 text-green-400 border border-green-500/30"
                          : p.order.status === "disputa"
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : p.order.status === "cancelada"
                          ? "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {p.order.status}
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
                      const active = p.order.stage >= num;
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
                </div>

                {/* AÇÕES DE SUPORTE E ENTREGA */}
                {p.order.status !== "concluida" && p.order.status !== "cancelada" && (
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
    </div>
  );
}
