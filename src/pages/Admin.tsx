import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { showToast } from "../components/gx/ui";

export default function Admin() {
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<"overview" | "disputas" | "usuarios" | "anuncios">("overview");

  const { data: me, isLoading: loadingMe } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query admin data
  const { data: overview, isLoading: loadingOverview } = trpc.admin.overview.useQuery(undefined, {
    enabled: me?.role === "admin",
  });

  const { data: disputes, isLoading: loadingDisputes } = trpc.admin.disputes.useQuery(undefined, {
    enabled: me?.role === "admin",
  });

  const { data: usersList, isLoading: loadingUsers } = trpc.admin.allUsers.useQuery(undefined, {
    enabled: me?.role === "admin",
  });

  const { data: listingsList, isLoading: loadingListings } = trpc.admin.allListings.useQuery(undefined, {
    enabled: me?.role === "admin",
  });

  // Dispute resolution states
  const [resolveOrderId, setResolveOrderId] = useState<number | null>(null);
  const [resolveAction, setResolveAction] = useState<"refund" | "release">("refund");
  const [resolveNote, setResolveNote] = useState("");

  // Mutations
  const resolveDisputeMutation = trpc.admin.resolveDispute.useMutation({
    onSuccess: () => {
      showToast("Disputa resolvida com sucesso!", "success");
      setResolveOrderId(null);
      setResolveNote("");
      utils.admin.disputes.invalidate();
      utils.admin.overview.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao resolver disputa.", "error"),
  });

  const toggleVerifiedMutation = trpc.admin.toggleUserVerified.useMutation({
    onSuccess: () => {
      showToast("Verificação do usuário atualizada!", "success");
      utils.admin.allUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao atualizar verificação.", "error"),
  });

  const setListingStatusMutation = trpc.admin.setListingStatus.useMutation({
    onSuccess: () => {
      showToast("Status do anúncio atualizado!", "success");
      utils.admin.allListings.invalidate();
      utils.admin.overview.invalidate();
    },
    onError: (err) => showToast(err.message || "Erro ao atualizar anúncio.", "error"),
  });

  const handleResolveDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (resolveOrderId === null) return;
    resolveDisputeMutation.mutate({
      orderId: resolveOrderId,
      action: resolveAction,
      note: resolveNote || undefined,
    });
  };

  const handleToggleVerified = (userId: number, currentVerified: boolean) => {
    toggleVerifiedMutation.mutate({
      userId,
      verified: !currentVerified,
    });
  };

  const handleSetListingStatus = (id: number, status: "ativo" | "pausado" | "vendido") => {
    setListingStatusMutation.mutate({ id, status });
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  if (loadingMe) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] bg-[#0F0F1A]">
        <div className="w-10 h-10 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Route protection
  if (!me || me.role !== "admin") {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">🚫</div>
        <h2 className="text-xl font-bold mb-2">Acesso Proibido</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">Você não possui permissões administrativas para acessar esta página.</p>
        <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">👑 Central do Administrador</h1>
        <p className="text-[#9CA3C0] text-sm">Mediação de conflitos, liberação de fundos e moderação geral do site.</p>
      </div>

      {/* ABAS */}
      <div className="flex gap-2 border-b border-[#2A2A4A] mb-6">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "overview" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab("disputas")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "disputas" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Disputas ({disputes?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("usuarios")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "usuarios" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Usuários ({usersList?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("anuncios")}
          className={`pb-3 px-4 font-bold text-sm transition ${
            activeTab === "anuncios" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0] hover:text-white"
          }`}
        >
          Anúncios ({listingsList?.length ?? 0})
        </button>
      </div>

      {/* 1. VISÃO GERAL */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {loadingOverview ? (
            <div>Carregando métricas...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Usuários</div>
                <div className="text-2xl font-black text-white">{overview?.users}</div>
              </div>
              <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Anúncios</div>
                <div className="text-2xl font-black text-white">{overview?.listings}</div>
              </div>
              <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Vendas (Volume)</div>
                <div className="text-2xl font-black text-[#00D2D3]">{overview?.orders}</div>
              </div>
              <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">GMV Transacionado</div>
                <div className="text-2xl font-black text-[#FFD700]">{fmt(overview?.gmv ?? 0)}</div>
              </div>
              <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5">
                <div className="text-[#9CA3C0] text-xs font-semibold uppercase mb-1">Mediações Ativas</div>
                <div className="text-2xl font-black text-red-400">{overview?.disputes}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. DISPUTAS */}
      {activeTab === "disputas" && (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
          <h3 className="text-lg font-bold mb-4">Disputas e Conflitos Ativos</h3>
          {loadingDisputes ? (
            <div>Carregando disputas...</div>
          ) : disputes?.length === 0 ? (
            <p className="text-sm text-[#9CA3C0] py-4 text-center">Nenhuma disputa pendente de mediação.</p>
          ) : (
            <div className="space-y-4">
              {disputes?.map((d: any) => (
                <div key={d.order.id} className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-5 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-[#2A2A4A]/60 text-sm">
                    <div>
                      <span className="font-bold text-white">Pedido #GX-{4000 + d.order.id}</span>
                      <span className="text-xs text-[#9CA3C0] ml-2">Comprador: {d.buyerName} vs Vendedor: {d.sellerName}</span>
                    </div>
                    <span className="font-black text-[#00D2D3]">{fmt(d.order.total)}</span>
                  </div>
                  <div className="text-xs text-[#9CA3C0]">
                    <strong className="text-white block mb-1">Motivo alegado pelo comprador:</strong>
                    "{d.order.disputeReason}"
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={() => {
                        setResolveOrderId(d.order.id);
                        setResolveAction("refund");
                        setResolveNote("");
                      }}
                      className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                    >
                      ⚖️ Resolver e Reembolsar
                    </button>
                    <button
                      onClick={() => {
                        setResolveOrderId(d.order.id);
                        setResolveAction("release");
                        setResolveNote("");
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                    >
                      ⚖️ Liberar para Vendedor
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. USUÁRIOS */}
      {activeTab === "usuarios" && (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
          <h3 className="text-lg font-bold mb-4">Gerenciamento de Usuários</h3>
          {loadingUsers ? (
            <div>Carregando usuários...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2A2A4A] text-[#9CA3C0] font-bold text-xs uppercase">
                    <th className="py-3 px-4">Nome</th>
                    <th className="py-3 px-4">E-mail</th>
                    <th className="py-3 px-4">Nível de Vendedor</th>
                    <th className="py-3 px-4">Vendas</th>
                    <th className="py-3 px-4">Verificado</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A4A]">
                  {usersList?.map((u: any) => (
                    <tr key={u.id} className="hover:bg-[#12122A]/50 transition">
                      <td className="py-4 px-4 font-bold text-white">{u.name}</td>
                      <td className="py-4 px-4 text-[#9CA3C0]">{u.email}</td>
                      <td className="py-4 px-4 text-xs font-bold text-gold uppercase">{u.sellerTier}</td>
                      <td className="py-4 px-4 text-white">{u.sellerSales}</td>
                      <td className="py-4 px-4">
                        <span className={u.verified ? "text-[#00D2D3]" : "text-red-400"}>
                          {u.verified ? "Sim ✔" : "Não"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => handleToggleVerified(u.id, u.verified)}
                          className="bg-[#12122A] hover:bg-[#1E1E35] border border-[#2A2A4A] text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {u.verified ? "Remover Selo" : "Dar Selo Verificado"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. ANÚNCIOS */}
      {activeTab === "anuncios" && (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6">
          <h3 className="text-lg font-bold mb-4">Gerenciamento de Anúncios</h3>
          {loadingListings ? (
            <div>Carregando anúncios...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2A2A4A] text-[#9CA3C0] font-bold text-xs uppercase">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Título</th>
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4">Preço</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A4A]">
                  {listingsList?.map((l: any) => (
                    <tr key={l.listing.id} className="hover:bg-[#12122A]/50 transition">
                      <td className="py-4 px-4 text-[#9CA3C0]">{l.listing.id}</td>
                      <td className="py-4 px-4 font-semibold text-white max-w-xs truncate">
                        <Link to={`/anuncio/${l.listing.id}`} className="hover:underline">{l.listing.title}</Link>
                      </td>
                      <td className="py-4 px-4 text-[#9CA3C0]">{l.sellerName}</td>
                      <td className="py-4 px-4 font-bold text-[#00D2D3]">{fmt(l.listing.price)}</td>
                      <td className="py-4 px-4 uppercase text-xs">{l.listing.status}</td>
                      <td className="py-4 px-4 text-center">
                        {l.listing.status !== "pausado" && (
                          <button
                            onClick={() => handleSetListingStatus(l.listing.id, "pausado")}
                            className="bg-yellow-600/10 hover:bg-yellow-600 border border-yellow-500/25 text-yellow-400 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            Pausar Anúncio
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DIALOG DE RESOLUÇÃO */}
      {resolveOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleResolveDispute} className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-2xl relative">
            <button
              type="button"
              onClick={() => setResolveOrderId(null)}
              className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold mb-4 text-white">⚖️ Decisão do Mediador</h3>
            <p className="text-xs text-[#9CA3C0] mb-4">
              Você está resolvendo a disputa do pedido #GX-{4000 + resolveOrderId} por meio de:{" "}
              <strong className="text-white">{resolveAction === "refund" ? "Reembolso ao Comprador" : "Liberação do Saldo ao Vendedor"}</strong>.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Nota Interna / Justificativa</label>
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Justifique a decisão para o histórico..."
                  rows={3}
                  className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
                />
              </div>

              <button
                type="submit"
                disabled={resolveDisputeMutation.isPending}
                className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-black py-3.5 rounded-xl transition disabled:opacity-50"
              >
                {resolveDisputeMutation.isPending ? "Processando..." : "Confirmar Julgamento"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
