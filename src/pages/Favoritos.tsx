import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { ListingCard } from "../components/gx/ListingCard";

export default function Favoritos() {
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query favorite listings
  const { data: favs, isLoading, refetch } = trpc.orders.favoritesList.useQuery(undefined, {
    enabled: !!me,
  });

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">❤️</div>
        <h2 className="text-xl font-bold mb-2">Suas Contas Favoritas</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Faça login para salvar anúncios e receber avisos quando houver reduções de preço.
        </p>
        <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white min-h-screen">
      <h1 className="text-3xl font-black mb-1">❤️ Favoritos</h1>
      <p className="text-[#9CA3C0] text-sm mb-8">Anúncios que você marcou com coração para acompanhar.</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-t-[#6C5CE7] border-gray-600 rounded-full animate-spin"></div>
        </div>
      ) : favs?.length === 0 ? (
        <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-12 text-center">
          <div className="text-5xl mb-4">❤️</div>
          <h3 className="text-lg font-bold mb-1">Nenhum favorito ainda</h3>
          <p className="text-[#9CA3C0] text-sm mb-6">Quando gostar de um anúncio, clique no coração para salvá-lo aqui.</p>
          <Link to="/marketplace" className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-2.5 rounded-xl transition">
            Ir ao Marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {favs?.map((item: any, i: number) => (
            <ListingCard key={item.listing.id} item={item} delay={i * 50} onFavToggle={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
