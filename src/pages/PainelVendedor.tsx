import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES, ESCROW_STEPS, isOrderPaid, orderStatusInfo } from "../../contracts/constants";
import { showToast } from "../components/gx/ui";

export default function PainelVendedor() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "anuncios" | "vendas" | "saques">("dashboard");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<"pix" | "ted" | "payoneer" | "crypto">("pix");
  const [withdrawDetails, setWithdrawDetails] = useState("");
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query dashboard statistics
  const { data: dashboard, isLoading: loadingDash } = trpc.orders.sellerDashboard.useQuery(undefined, {
    enabled: !!me,
  });

  // Query user's own listings
  const { data: mineListings, isLoading: loadingListings } = trpc.listings.mine.useQuery(undefined, {
    enabled: !!me,
  });

  // Query user's sales (orders where they are the seller)
  const { data: sales, isLoading: loadingSales } = trpc.orders.mySales.useQuery(undefined, {
    enabled: !!me,
  });

  // Query user's withdrawals
  const { data: withdrawalsList, isLoading: loadingWithdrawals } = trpc.withdrawals.myWithdrawals.useQuery(undefined, {
    enabled: !!me,
  });

  const requestWithdrawalMutation = trpc.withdrawals.requestWithdrawal.useMutation({
    onSuccess: () => {
      showToast("Solicitação de saque enviada com sucesso!", "success");
      utils.withdrawals.myWithdrawals.invalidate();
      utils.orders.sellerDashboard.invalidate();
      setWithdrawAmount("");
      setWithdrawMethod("pix");
      setWithdrawDetails("");
    },
    onError: (err) => showToast(err.message || "Erro ao solicitar saque.", "error"),
  });

  // Toggle listing status (active/paused)
  const toggleStatusMutation = trpc.listings.update.useMutation({
    onSuccess: () => {
      showToast("Status atualizado!", "success");
      utils.listings.mine.invalidate();
      utils.orders.sellerDashboard.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao atualizar status.", "error"),
  });

  // Delete listing
  const deleteListingMutation = trpc.listings.remove.useMutation({
    onSuccess: () => {
      showToast("Anúncio removido.", "info");
      utils.listings.mine.invalidate();
      utils.orders.sellerDashboard.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao remover anúncio.", "error"),
  });

  // Advance escrow stage (Simulate delivery/steps)
  const advanceMutation = trpc.orders.advanceStage.useMutation({
    onSuccess: () => {
      showToast("Estágio de entrega atualizado!", "success");
      utils.orders.mySales.invalidate();
      utils.orders.sellerDashboard.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao avançar estágio.", "error"),
  });

  const handleToggleStatus = (id: number, currentStatus: "ativo" | "pausado") => {
    const status = currentStatus === "ativo" ? "pausado" : "ativo";
    toggleStatusMutation.mutate({ id, status });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir permanentemente este anúncio?")) {
      deleteListingMutation.mutate({ id });
    }
  };

  const handleAdvance = (orderId: number) => {
    advanceMutation.mutate({ orderId });
  };

  const handleRequestWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(withdrawAmount) * 100;
    if (amount <= 0) return showToast("Valor inválido", "error");
    requestWithdrawalMutation.mutate({
      amount,
      method: withdrawMethod,
      destinationDetails: withdrawDetails
    });
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold mb-2">Acesse seu Painel Vendedor</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Faça login para acompanhar suas vendas, ver saldo a receber e gerenciar seus anúncios.
        </p>
        <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white">
      {/* HEADER DO PAINEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">📊 Painel do Vendedor</h1>
          <p className="text-[#9CA3C0] text-sm">Gerencie seus anúncios e acompanhe o andamento de suas vendas.</p>
        </div>
        <Link
          to="/vender"
          className="bg-[#00D2D3] hover:bg-[#00b2b3] text-black font-black px-5 py-3 rounded-xl transition text-sm text-center"
        >
          💰 Novo Anúncio Grátis
        </Link>
      </div>

      {/* ABAS */}
      <div className="flex gap-2 border-b border-[#2A2A4A] mb-6">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "dashboard" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Resumo e Saldo
        </button>
        <button
          onClick={() => setActiveTab("anuncios")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "anuncios" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Meus Anúncios ({mineListings?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("vendas")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "vendas" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Minhas Vendas ({sales?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("saques")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "saques" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Financeiro e Saques
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {loadingDash ? (
            <div className="text-center py-12">Carregando métricas...</div>
          ) : (
            <>
              {/* METRICAS PRINCIPAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                  <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Saldo Disponível</div>
                  <div className="text-2xl font-black text-[#00D2D3]">{fmt(dashboard?.balance ?? 0)}</div>
                  <div className="text-[10px] text-[#9CA3C0] mt-1">Livre para saque via PIX</div>
                </div>
                <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                  <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Saldo Pendente</div>
                  <div className="text-2xl font-black text-[#FFD700]">{fmt(dashboard?.pendingBalance ?? 0)}</div>
                  <div className="text-[10px] text-[#9CA3C0] mt-1">Retido temporariamente em escrow</div>
                </div>
                <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                  <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Receita Total</div>
                  <div className="text-2xl font-black text-white">{fmt(dashboard?.receita ?? 0)}</div>
                  <div className="text-[10px] text-[#9CA3C0] mt-1">Vendas líquidas após taxas</div>
                </div>
                <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                  <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Anúncios Ativos</div>
                  <div className="text-2xl font-black text-[#8B7CF0]">{dashboard?.activeListings} / {dashboard?.totalListings}</div>
                  <div className="text-[10px] text-[#9CA3C0] mt-1">Contas à venda no marketplace</div>
                </div>
              </div>

              {/* AGENDA DE PAGAMENTOS E DISPUTAS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* AGENDA DE REPASSES */}
                <div className="lg:col-span-2 bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
                  <h3 className="text-lg font-bold mb-4">📅 Próximos Repasses</h3>
                  {dashboard?.pending?.length === 0 ? (
                    <p className="text-sm text-[#9CA3C0] py-4">Nenhum saldo pendente com data de liberação programada.</p>
                  ) : (
                    <div className="divide-y divide-[#2A2A4A]">
                      {dashboard?.pending?.map((p: any) => (
                        <div key={p.orderId} className="flex justify-between items-center py-3 text-sm">
                          <div>
                            <span className="font-bold text-white">Pedido #GX-{4000 + p.orderId}</span>
                            <div className="text-xs text-[#9CA3C0]">Libera em: {new Date(p.unlockAt).toLocaleDateString("pt-BR")}</div>
                          </div>
                          <div className="font-black text-[#00D2D3]">{fmt(p.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SUPORTE E DISPUTAS */}
                <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
                  <h3 className="text-lg font-bold mb-3">⚖️ Mediações e Disputas</h3>
                  <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 text-center">
                    <div className="text-3xl mb-2">⚖️</div>
                    <div className="text-sm font-black text-white">{dashboard?.disputes ?? 0} disputas em andamento</div>
                    <p className="text-xs text-[#9CA3C0] mt-2">
                      Caso o comprador abra disputa, responda imediatamente via chat para que a equipe de mediação libere o saldo.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: MEUS ANÚNCIOS */}
      {activeTab === "anuncios" && (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4">Meus Anúncios Publicados</h2>
          {loadingListings ? (
            <div className="text-center py-8">Carregando anúncios...</div>
          ) : mineListings?.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#9CA3C0] text-sm mb-4">Você ainda não publicou nenhum anúncio.</p>
              <Link
                to="/vender"
                className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-2.5 rounded-xl transition"
              >
                Anunciar Conta Agora
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2A2A4A] text-[#9CA3C0] font-bold text-xs uppercase">
                    <th className="py-3 px-4">Jogo</th>
                    <th className="py-3 px-4">Título</th>
                    <th className="py-3 px-4">Rank / Nível</th>
                    <th className="py-3 px-4">Preço</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A4A]">
                  {mineListings?.map((l: any) => {
                    const game = GAMES.find((g) => g.id === l.gameId) || GAMES[0];
                    return (
                      <tr key={l.id} className="hover:bg-[#12122A]/50 transition">
                        <td className="py-4 px-4 text-lg">{game.icone}</td>
                        <td className="py-4 px-4 font-semibold text-white max-w-xs truncate">
                          <Link to={`/anuncio/${l.id}`} className="hover:underline">{l.title}</Link>
                        </td>
                        <td className="py-4 px-4 text-xs text-[#9CA3C0]">
                          {l.rank} {l.level > 0 ? `(Nv. ${l.level})` : ""}
                        </td>
                        <td className="py-4 px-4 font-bold text-[#00D2D3]">{fmt(l.price)}</td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              l.status === "ativo"
                                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(l.id, l.status)}
                            className="bg-[#12122A] hover:bg-[#1E1E35] border border-[#2A2A4A] text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            {l.status === "ativo" ? "Pausar" : "Ativar"}
                          </button>
                          <Link
                            to={`/editar/${l.id}`}
                            className="bg-[#00D2D3]/10 hover:bg-[#00D2D3] text-[#00D2D3] hover:text-black border border-[#00D2D3]/25 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            Editar
                          </Link>
                          <button
                            onClick={() => handleDelete(l.id)}
                            className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/25 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: MINHAS VENDAS */}
      {activeTab === "vendas" && (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4">Minhas Vendas Realizadas</h2>
          {loadingSales ? (
            <div className="text-center py-8">Carregando vendas...</div>
          ) : sales?.length === 0 ? (
            <p className="text-[#9CA3C0] text-sm py-4 text-center">Nenhuma venda realizada até o momento.</p>
          ) : (
            <div className="space-y-4">
              {sales?.map((s: any) => {
                const game = GAMES.find((g) => g.id === s.listing.gameId) || GAMES[0];
                const paid = isOrderPaid(s.order);
                const statusInfo = orderStatusInfo(s.order);
                return (
                  <div key={s.order.id} className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#2A2A4A]">
                      <div>
                        <span className="font-bold text-white text-base">Pedido #GX-{4000 + s.order.id}</span>
                        <span className="text-xs text-[#9CA3C0] ml-2">Comprador: {s.buyerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#9CA3C0]">Status da transação:</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusInfo.chip}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#17172B] flex items-center justify-center text-2xl shrink-0">
                        {game.icone}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white text-sm truncate">{s.listing.title}</div>
                        <div className="text-xs text-[#9CA3C0]">Valor líquido: {fmt(s.order.price)} (Preço total: {fmt(s.order.total)})</div>
                      </div>
                    </div>

                    {/* PROGRESSO DO ESCROW */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-[#9CA3C0] uppercase">Estágio de Entrega</div>
                      <div className="grid grid-cols-4 gap-1.5 text-[10px] sm:text-xs text-center font-bold">
                        {ESCROW_STEPS.map((step, idx) => {
                          const num = idx + 1;
                          const active = paid && s.order.stage >= num;
                          return (
                            <div
                              key={idx}
                              className={`py-2 rounded-lg border transition ${
                                active
                                  ? "bg-[#6C5CE7]/15 border-[#6C5CE7] text-white"
                                  : "bg-[#17172B]/30 border-[#2A2A4A] text-[#9CA3C0]"
                              }`}
                            >
                              {step}
                            </div>
                          );
                        })}
                      </div>
                      {!paid && (
                        <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                          ⏳ Pagamento ainda não confirmado. Você será notificado assim que o comprador pagar.
                        </div>
                      )}
                    </div>

                    {/* BOTÕES DE CONTROLE DA ENTREGA */}
                    {paid && s.order.stage < 3 && s.order.status !== "disputa" && (
                      <div className="flex gap-2 justify-end pt-2">
                        <button
                          onClick={() => handleAdvance(s.order.id)}
                          className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                        >
                          {s.order.stage === 1 ? "📦 Marcar como Enviado" : "🔍 Enviar para Inspeção"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* CONTEÚDO DA ABA 4: SAQUES */}
      {activeTab === "saques" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Resumo de Saldos */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6 flex flex-col justify-center">
              <h2 className="text-xl font-bold mb-4">Saldos</h2>
              <div className="space-y-4">
                <div className="bg-[#12122A] rounded-2xl p-4 border border-[#00D2D3]/30">
                  <div className="text-sm text-[#9CA3C0] uppercase font-bold mb-1">Disponível para Saque</div>
                  <div className="text-3xl font-black text-[#00D2D3]">{fmt(dashboard?.balance ?? 0)}</div>
                </div>
                <div className="bg-[#12122A] rounded-2xl p-4 border border-[#2A2A4A]">
                  <div className="text-sm text-[#9CA3C0] uppercase font-bold mb-1">Retido (Escrow de 20 dias)</div>
                  <div className="text-xl font-bold text-white">{fmt(dashboard?.pendingBalance ?? 0)}</div>
                </div>
              </div>
            </div>

            {/* Formulário de Saque */}
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
              <h2 className="text-xl font-bold mb-4">Solicitar Saque</h2>
              <form onSubmit={handleRequestWithdrawal} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#9CA3C0] mb-2">Método de Saque</label>
                  <select 
                    value={withdrawMethod}
                    onChange={(e) => setWithdrawMethod(e.target.value as any)}
                    className="w-full bg-[#12122A] border border-[#2A2A4A] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#6C5CE7]"
                  >
                    <option value="pix">PIX</option>
                    <option value="ted">Transferência Bancária (TED)</option>
                    <option value="payoneer">Payoneer</option>
                    <option value="crypto">Criptomoedas (USDT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#9CA3C0] mb-2">Detalhes (Chave PIX / Carteira)</label>
                  <input
                    type="text"
                    required
                    value={withdrawDetails}
                    onChange={(e) => setWithdrawDetails(e.target.value)}
                    placeholder={withdrawMethod === "pix" ? "Sua chave PIX (CPF, Email, Celular)" : "Dados bancários completos"}
                    className="w-full bg-[#12122A] border border-[#2A2A4A] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#6C5CE7]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#9CA3C0] mb-2">Valor (R$)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Ex: 50.00"
                    className="w-full bg-[#12122A] border border-[#2A2A4A] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#6C5CE7]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={requestWithdrawalMutation.isPending || (dashboard?.balance ?? 0) <= 0}
                  className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-black py-3 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requestWithdrawalMutation.isPending ? "Solicitando..." : "Confirmar Solicitação"}
                </button>
              </form>
            </div>
          </div>

          {/* Histórico */}
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
            <h2 className="text-xl font-bold mb-4">Histórico de Saques</h2>
            {loadingWithdrawals ? (
              <div className="text-center py-8">Carregando histórico...</div>
            ) : withdrawalsList?.length === 0 ? (
              <p className="text-[#9CA3C0] text-sm py-4 text-center">Nenhum saque solicitado até o momento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-[#2A2A4A] text-[#9CA3C0]">
                      <th className="pb-3 font-semibold">Data</th>
                      <th className="pb-3 font-semibold">Método</th>
                      <th className="pb-3 font-semibold">Valor</th>
                      <th className="pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawalsList?.map((w: any) => (
                      <tr key={w.id} className="border-b border-[#2A2A4A]/50">
                        <td className="py-4 text-white">
                          {new Date(w.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-4 text-white uppercase">{w.method}</td>
                        <td className="py-4 font-bold text-white">{fmt(w.amount)}</td>
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            w.status === "pendente" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                            w.status === "processando" ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" :
                            w.status === "concluido" ? "bg-green-500/10 text-green-400 border border-green-500/30" :
                            "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}>
                            {w.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
