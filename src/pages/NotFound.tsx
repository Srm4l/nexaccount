import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
      <div className="text-5xl mb-4">🔍</div>
      <h2 className="text-xl font-bold mb-2">Página não encontrada</h2>
      <p className="text-[#9CA3C0] text-sm mb-6">A página que você está procurando não existe ou foi movida.</p>
      <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
        Voltar ao Início
      </Link>
    </div>
  );
}
