import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES, TESTIMONIALS } from "../../contracts/constants";
import { ListingCard } from "../components/gx/ListingCard";

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Query popular/featured listings
  const { data: popularListings, isLoading: loadingPopular } = trpc.listings.list.useQuery({
    featuredOnly: true,
    pageSize: 6,
  });

  // Query recent listings
  const { data: recentListings, isLoading: loadingRecent } = trpc.listings.list.useQuery({
    pageSize: 4,
    sort: "recente",
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    navigate(`/marketplace${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  };

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-20 pb-24 bg-gradient-to-b from-[#6C5CE7]/10 via-transparent to-[#0F0F1A]">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#6C5CE7]/20 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#00D2D3]/15 rounded-full blur-[120px]"></div>
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-[#17172B] border border-[#6C5CE7]/40 rounded-full px-4 py-1.5 text-xs font-semibold text-[#8B7CF0] mb-6">
            🛡️ Protegido por GameProtect™ — Garantia de 7 dias
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            O jeito mais <span className="bg-gradient-to-r from-[#6C5CE7] to-[#00D2D3] bg-clip-text text-transparent">seguro</span> e fácil de comprar e vender <span className="bg-gradient-to-r from-[#6C5CE7] to-[#00D2D3] bg-clip-text text-transparent">contas de jogos</span>
          </h1>
          <p className="text-[#9CA3C0] mt-5 text-lg max-w-2xl mx-auto">
            Escrow integrado, vendedores verificados e suporte 24/7. Milhares de contas de LoL, Valorant, Free Fire, Fortnite e muito mais.
          </p>

          <form onSubmit={handleSearch} className="mt-8 flex max-w-xl mx-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar: 'Diamante LoL', 'Renegade Raider', 'Free Fire angelical'..."
              className="flex-1 bg-[#12122A] border border-[#2A2A4A] rounded-l-xl px-5 py-4 text-sm outline-none focus:border-[#6C5CE7] transition placeholder:text-gray-600 text-white"
            />
            <button type="submit" className="bg-[#6C5CE7] hover:bg-[#8B7CF0] px-6 rounded-r-xl font-bold transition shadow-lg shadow-[#6C5CE7]/30">
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap justify-center gap-2 mt-5 text-xs">
            {GAMES.slice(0, 6).map((g) => (
              <Link
                key={g.id}
                to={`/marketplace?game=${g.id}`}
                className="bg-[#17172B] border border-[#2A2A4A] hover:border-[#6C5CE7] rounded-full px-3 py-1.5 transition text-white"
              >
                {g.icone} {g.nome}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* GAMES CATEGORIES */}
      <section className="max-w-7xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-black mb-6 text-white">🎮 Jogos em Destaque</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {GAMES.map((g) => (
            <Link
              key={g.id}
              to={`/marketplace?game=${g.id}`}
              className="bg-[#17172B] border border-[#2A2A4A] hover:border-[#6C5CE7] hover:-translate-y-1.5 transition duration-300 rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: `linear-gradient(135deg, ${g.grad[0]}, ${g.grad[1]})`,
                }}
              >
                {g.icone}
              </div>
              <div className="font-bold text-sm text-white">{g.nome}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* POPULAR NOW */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-white">🔥 Populares Agora</h2>
          <Link to="/marketplace" className="text-sm font-semibold text-[#00D2D3] hover:underline">
            Ver todos →
          </Link>
        </div>
        {loadingPopular ? (
          <div className="flex justify-center py-12"><div className="w-10 h-10 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {popularListings?.items?.map((item: any, i: number) => (
              <ListingCard key={item.listing.id} item={item} delay={i * 80} />
            ))}
          </div>
        )}
      </section>

      {/* STATISTICS */}
      <section className="max-w-7xl mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="text-center bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-8 hover:-translate-y-1 transition duration-300">
            <div className="text-4xl mb-3">🏆</div>
            <div className="text-4xl font-black text-[#FFD700]">10.000+</div>
            <div className="text-[#9CA3C0] text-sm mt-2">contas vendidas com segurança</div>
          </div>
          <div className="text-center bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-8 hover:-translate-y-1 transition duration-300">
            <div className="text-4xl mb-3">💚</div>
            <div className="text-4xl font-black text-[#00D2D3]">99%</div>
            <div className="text-[#9CA3C0] text-sm mt-2">de satisfação dos compradores</div>
          </div>
          <div className="text-center bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-8 hover:-translate-y-1 transition duration-300">
            <div className="text-4xl mb-3">🎧</div>
            <div className="text-4xl font-black text-[#6C5CE7]">24/7</div>
            <div className="text-[#9CA3C0] text-sm mt-2">suporte humano especializado</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-black mb-2 text-center text-white">🛡️ Como funciona o GameProtect™</h2>
        <p className="text-[#9CA3C0] text-center text-sm mb-8 max-w-xl mx-auto">
          Seu dinheiro fica em escrow até você confirmar que a conta é exatamente como anunciada.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">💳</div>
            <div className="font-bold text-white mb-2">1. Pagamento</div>
            <div className="text-[#9CA3C0] text-xs leading-relaxed">Você paga e o valor fica retido em escrow seguro.</div>
          </div>
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">📦</div>
            <div className="font-bold text-white mb-2">2. Entrega</div>
            <div className="text-[#9CA3C0] text-xs leading-relaxed">O vendedor entrega os dados da conta em até 24h.</div>
          </div>
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <div className="font-bold text-white mb-2">3. Inspeção</div>
            <div className="text-[#9CA3C0] text-xs leading-relaxed">Você tem 7 dias para verificar tudo com calma.</div>
          </div>
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">✅</div>
            <div className="font-bold text-white mb-2">4. Liberação</div>
            <div className="text-[#9CA3C0] text-xs leading-relaxed">Confirmou? O vendedor recebe. Problema? Reembolso total.</div>
          </div>
        </div>
      </section>

      {/* RECENT ADDITIONS */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-white">🆕 Anúncios Recentes</h2>
          <Link to="/marketplace" className="text-sm font-semibold text-[#00D2D3] hover:underline">
            Ver todos →
          </Link>
        </div>
        {loadingRecent ? (
          <div className="flex justify-center py-12"><div className="w-10 h-10 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {recentListings?.items?.map((item: any, i: number) => (
              <ListingCard key={item.listing.id} item={item} delay={i * 60} />
            ))}
          </div>
        )}
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-7xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-black mb-6 text-center text-white">💬 Quem usa, confia</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-[#17172B] border border-[#2A2A4A] rounded-2xl p-6 hover:-translate-y-1 transition duration-300">
              <div className="text-[#FFD700] text-sm">
                {"★".repeat(t.nota)}
                {"☆".repeat(5 - t.nota)}
              </div>
              <p className="text-sm text-[#9CA3C0] mt-3 leading-relaxed">"{t.texto}"</p>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#2A2A4A]">
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00D2D3] flex items-center justify-center font-bold text-sm text-white">
                  {t.nome[0]}
                </span>
                <div>
                  <div className="text-sm font-bold text-white">{t.nome}</div>
                  <div className="text-xs text-[#9CA3C0]">{t.jogo}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <div className="relative overflow-hidden rounded-3xl border border-[#6C5CE7]/40 bg-gradient-to-br from-[#6C5CE7]/20 to-[#00D2D3]/10 p-10 text-center">
          <h2 className="text-3xl font-black text-white">
            Tem uma conta parada? <span className="bg-gradient-to-r from-[#6C5CE7] to-[#00D2D3] bg-clip-text text-transparent">Venda agora.</span>
          </h2>
          <p className="text-[#9CA3C0] mt-3">Anuncie grátis, receba propostas e saque via PIX após o prazo de proteção de 20 dias.</p>
          <Link
            to="/vender"
            className="inline-block mt-6 bg-[#FFD700] hover:scale-105 transition text-black font-black px-8 py-3.5 rounded-full"
          >
            💰 Criar Anúncio Grátis
          </Link>
        </div>
      </section>
    </div>
  );
}
