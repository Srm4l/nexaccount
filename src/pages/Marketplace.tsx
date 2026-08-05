import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES } from "../../contracts/constants";
import { ListingCard } from "../components/gx/ListingCard";

export default function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load initial state from URL query parameters
  const [game, setGame] = useState(searchParams.get("game") || "");
  const [rank, setRank] = useState(searchParams.get("rank") || "");
  const [server, setServer] = useState(searchParams.get("server") || "");
  const [maxPrice, setMaxPrice] = useState(Number(searchParams.get("maxPrice") || 5000));
  const [minLevel, setMinLevel] = useState(Number(searchParams.get("minLevel") || 0));
  const [verifiedOnly, setVerifiedOnly] = useState(searchParams.get("verified") === "true");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [sort, setSort] = useState<"recente" | "menor" | "maior" | "avaliado">((searchParams.get("sort") as any) || "recente");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));

  // Sync state changes with URL query parameters
  useEffect(() => {
    const params: Record<string, string> = {};
    if (game) params.game = game;
    if (rank) params.rank = rank;
    if (server) params.server = server;
    if (maxPrice !== 5000) params.maxPrice = String(maxPrice);
    if (minLevel !== 0) params.minLevel = String(minLevel);
    if (verifiedOnly) params.verified = "true";
    if (query) params.q = query;
    if (sort !== "recente") params.sort = sort;
    if (page !== 1) params.page = String(page);
    setSearchParams(params);
  }, [game, rank, server, maxPrice, minLevel, verifiedOnly, query, sort, page]);

  // Handle category selection from home page or direct link changes
  useEffect(() => {
    setGame(searchParams.get("game") || "");
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  // Query tRPC list API
  const { data, isLoading } = trpc.listings.list.useQuery({
    game: game || undefined,
    rank: rank || undefined,
    server: server || undefined,
    maxPrice: maxPrice || undefined,
    minLevel: minLevel || undefined,
    verifiedOnly: verifiedOnly || undefined,
    query: query || undefined,
    sort,
    page,
    pageSize: 9,
  });

  const resetFilters = () => {
    setGame("");
    setRank("");
    setServer("");
    setMaxPrice(5000);
    setMinLevel(0);
    setVerifiedOnly(false);
    setQuery("");
    setSort("recente");
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / 9);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 bg-[#0F0F1A] text-white">
      <h1 className="text-3xl font-black mb-1">🛍️ Marketplace</h1>
      <p className="text-[#9CA3C0] text-sm mb-6">{totalItems} contas verificadas disponíveis</p>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* SIDEBAR FILTROS */}
        <aside className="lg:w-72 shrink-0">
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-5 lg:sticky lg:top-20">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-white">🎚️ Filtros</span>
              <button onClick={resetFilters} className="text-xs text-[#00D2D3] hover:underline">
                Limpar
              </button>
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar..."
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#6C5CE7] transition mb-4 text-white"
            />

            <div className="space-y-4 text-sm">
              <div>
                <label className="text-xs font-bold text-[#9CA3C0] uppercase tracking-wider">Jogo</label>
                <select
                  value={game}
                  onChange={(e) => {
                    setGame(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 w-full bg-[#12122A] border border-[#2A2A4A] rounded-lg px-3 py-2.5 outline-none focus:border-[#6C5CE7] text-white"
                >
                  <option value="">Todos os jogos</option>
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.icone} {g.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#9CA3C0] uppercase tracking-wider">Rank</label>
                <select
                  value={rank}
                  onChange={(e) => {
                    setRank(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 w-full bg-[#12122A] border border-[#2A2A4A] rounded-lg px-3 py-2.5 outline-none focus:border-[#6C5CE7] text-white"
                >
                  <option value="">Qualquer rank</option>
                  <option value="Radiant">Radiant (Valorant)</option>
                  <option value="Immortal">Immortal (Valorant)</option>
                  <option value="Diamante">Diamante (LoL / Valorant)</option>
                  <option value="Mestre">Mestre (LoL / FF)</option>
                  <option value="Desafiante">Desafiante (LoL)</option>
                  <option value="Global">Global Elite (CS2)</option>
                  <option value="Nível">Nível Máximo (GTA / Outros)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#9CA3C0] uppercase tracking-wider">Servidor</label>
                <select
                  value={server}
                  onChange={(e) => {
                    setServer(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 w-full bg-[#12122A] border border-[#2A2A4A] rounded-lg px-3 py-2.5 outline-none focus:border-[#6C5CE7] text-white"
                >
                  <option value="">Todos</option>
                  <option value="BR">BR (Brasil)</option>
                  <option value="Global">Global</option>
                  <option value="PC">PC</option>
                  <option value="PS5">PS5</option>
                  <option value="Java Edition">Java Edition (Minecraft)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#9CA3C0] uppercase tracking-wider flex justify-between">
                  Preço máx: <span className="text-[#00D2D3]">{fmt(maxPrice)}</span>
                </label>
                <input
                  type="range"
                  min="100"
                  max="6000"
                  step="100"
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-full mt-2 accent-[#6C5CE7]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#9CA3C0] uppercase tracking-wider flex justify-between">
                  Nível mínimo: <span className="text-[#00D2D3]">{minLevel}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1500"
                  step="50"
                  value={minLevel}
                  onChange={(e) => {
                    setMinLevel(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-full mt-2 accent-[#6C5CE7]"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none text-white">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => {
                    setVerifiedOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 accent-[#6C5CE7] rounded"
                />
                <span>Apenas verificados ✔</span>
              </label>
            </div>
          </div>
        </aside>

        {/* LISTINGS GRID AND SORT */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-[#17172B] border border-[#2A2A4A] p-4 rounded-2xl">
            <div className="text-sm text-[#9CA3C0]">
              Mostrando <span className="text-white font-bold">{data?.items?.length ?? 0}</span> de{" "}
              <span className="text-white font-bold">{totalItems}</span> anúncios
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#9CA3C0]">Ordenar por:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-[#12122A] border border-[#2A2A4A] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#6C5CE7] text-white"
              >
                <option value="recente">Mais Recente</option>
                <option value="menor">Menor Preço</option>
                <option value="maior">Maior Preço</option>
                <option value="avaliado">Melhores Vendedores</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-24">
              <div className="w-12 h-12 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
            </div>
          ) : data?.items?.length === 0 ? (
            <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-lg font-bold mb-1 text-white">Nenhum anúncio encontrado</h3>
              <p className="text-[#9CA3C0] text-sm">Tente redefinir os filtros ou buscar por outro termo.</p>
              <button
                onClick={resetFilters}
                className="mt-4 bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-5 py-2 rounded-xl transition text-sm"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {data?.items?.map((item: any, i: number) => (
                  <ListingCard key={item.listing.id} item={item} delay={i * 50} />
                ))}
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-1.5 mt-8">
                  <button
                    disabled={page === 1}
                    onClick={() => handlePageChange(page - 1)}
                    className="px-3.5 py-2 bg-[#17172B] border border-[#2A2A4A] hover:border-[#6C5CE7] rounded-lg text-sm transition disabled:opacity-40"
                  >
                    ◀
                  </button>
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition ${
                        page === p
                          ? "bg-[#6C5CE7] border-[#6C5CE7] text-white"
                          : "bg-[#17172B] border-[#2A2A4A] hover:border-[#6C5CE7] text-[#9CA3C0]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={page === totalPages}
                    onClick={() => handlePageChange(page + 1)}
                    className="px-3.5 py-2 bg-[#17172B] border border-[#2A2A4A] hover:border-[#6C5CE7] rounded-lg text-sm transition disabled:opacity-40"
                  >
                    ▶
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
