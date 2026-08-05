import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="border-t border-[#2A2A4A] mt-16 bg-[#17172B]/40">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎮</span>
            <span className="font-black text-white">
              Game<span className="bg-gradient-to-r from-[#6C5CE7] to-[#00D2D3] bg-clip-text text-transparent">Exchange</span>
            </span>
          </div>
          <p className="text-[#9CA3C0] leading-relaxed">
            O marketplace mais seguro para comprar e vender contas de jogos, com garantia GameProtect™.
          </p>
          <div className="flex gap-3 mt-4 text-xl">
            <a href="#" className="hover:scale-110 transition" title="Discord">💬</a>
            <a href="#" className="hover:scale-110 transition" title="Instagram">📸</a>
            <a href="#" className="hover:scale-110 transition" title="YouTube">▶️</a>
            <a href="#" className="hover:scale-110 transition" title="X">🐦</a>
          </div>
        </div>
        <div>
          <div className="font-bold text-white mb-3">Empresa</div>
          <div className="flex flex-col gap-2 text-[#9CA3C0]">
            <Link to="#" className="hover:text-white transition">Sobre nós</Link>
            <Link to="#" className="hover:text-white transition">Carreiras</Link>
            <Link to="#" className="hover:text-white transition">Imprensa</Link>
            <Link to="#" className="hover:text-white transition">Blog</Link>
          </div>
        </div>
        <div>
          <div className="font-bold text-white mb-3">Legal</div>
          <div className="flex flex-col gap-2 text-[#9CA3C0]">
            <Link to="#" className="hover:text-white transition">Termos de Uso</Link>
            <Link to="#" className="hover:text-white transition">Privacidade</Link>
            <Link to="#" className="hover:text-white transition">Política de Reembolso</Link>
            <Link to="#" className="hover:text-white transition">Regras do Marketplace</Link>
          </div>
        </div>
        <div>
          <div className="font-bold text-white mb-3">Suporte</div>
          <div className="flex flex-col gap-2 text-[#9CA3C0]">
            <Link to="#" className="hover:text-white transition">Central de Ajuda</Link>
            <Link to="#" className="hover:text-white transition">Fale Conosco</Link>
            <Link to="/chat" className="hover:text-white transition">Chat ao Vivo 24/7</Link>
            <Link to="#" className="hover:text-white transition">Status do Sistema</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-[#2A2A4A] py-5 text-center text-xs text-[#9CA3C0]">
        © 2026 ContaGamer — Todos os direitos reservados. Feito para gamers, por gamers. 🛡️
      </div>
    </footer>
  );
}
