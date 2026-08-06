export const Session = {
  cookieName: "kimi_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

// ── ContaGamer domain constants (shared frontend/backend) ──

export type GameDef = {
  id: string;
  nome: string;
  icone: string;
  grad: [string, string];
  cor: string;
};

export const GAMES: GameDef[] = [
  { id: "lol", nome: "League of Legends", icone: "⚔️", grad: ["#0A1428", "#1E3A5F"], cor: "#0AC8B9" },
  { id: "valorant", nome: "Valorant", icone: "🎯", grad: ["#FF4655", "#4A1520"], cor: "#FF4655" },
  { id: "freefire", nome: "Free Fire", icone: "🔥", grad: ["#FF8C00", "#5C2E00"], cor: "#FFB43A" },
  { id: "roblox", nome: "Roblox", icone: "🧱", grad: ["#E2231A", "#4A0D0B"], cor: "#FF5A52" },
  { id: "gta5", nome: "GTA V", icone: "🌆", grad: ["#1B5E20", "#0B2E0F"], cor: "#7BD88F" },
  { id: "fortnite", nome: "Fortnite", icone: "🪂", grad: ["#6C5CE7", "#221C50"], cor: "#A29BFE" },
  { id: "minecraft", nome: "Minecraft", icone: "⛏️", grad: ["#3E5C2B", "#17240F"], cor: "#8BC34A" },
  { id: "cs2", nome: "Counter-Strike 2", icone: "💣", grad: ["#37474F", "#10181D"], cor: "#F5A623" },
  { id: "fifa", nome: "EA FC 25", icone: "⚽", grad: ["#0D47A1", "#071F45"], cor: "#42A5F5" },
  { id: "apex", nome: "Apex Legends", icone: "🅰️", grad: ["#B71C1C", "#3E0A0A"], cor: "#EF5350" },
  { id: "clashofclans", nome: "Clash of Clans", icone: "🏰", grad: ["#D4AF37", "#4E3629"], cor: "#F1C40F" },
  { id: "clashroyale", nome: "Clash Royale", icone: "👑", grad: ["#1565C0", "#0D47A1"], cor: "#1E88E5" },
  { id: "brawlstars", nome: "Brawl Stars", icone: "⭐", grad: ["#FFC107", "#E65100"], cor: "#FFEB3B" },
  { id: "genshin", nome: "Genshin Impact", icone: "✨", grad: ["#4A148C", "#1A237E"], cor: "#9C27B0" },
  { id: "honkai", nome: "Honkai: Star Rail", icone: "☄️", grad: ["#006064", "#004D40"], cor: "#00ACC1" },
  { id: "codm", nome: "COD Mobile", icone: "🎖️", grad: ["#3E2723", "#1B5E20"], cor: "#8D6E63" },
  { id: "wildrift", nome: "Wild Rift", icone: "🌀", grad: ["#006064", "#01579B"], cor: "#00E5FF" },
  { id: "pubgm", nome: "PUBG Mobile", icone: "🪖", grad: ["#263238", "#212121"], cor: "#78909C" },
];

export const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze",
  prata: "Prata",
  ouro: "Ouro",
  diamante: "Diamante",
};

export const ESCROW_STEPS = [
  "💳 Pagamento Confirmado",
  "📦 Aguardando Entrega",
  "🔍 Em Inspeção",
  "✅ Concluído",
] as const;

export function isOrderPaid(order: { status: string; stage: number }): boolean {
  return order.status === "inspecao" || order.status === "concluida" || order.status === "disputa" || order.stage >= 2;
}

export function orderStatusInfo(order: { status: string; stage: number }) {
  if (order.status === "concluida") return { label: "Concluída", chip: "bg-green-500/10 text-green-400 border border-green-500/30" };
  if (order.status === "disputa") return { label: "Em Disputa", chip: "bg-red-500/10 text-red-400 border border-red-500/30" };
  if (order.status === "cancelada") return { label: "Cancelada", chip: "bg-gray-500/10 text-gray-400 border border-gray-500/30" };
  if (!isOrderPaid(order)) return { label: "Aguardando Pagamento", chip: "bg-amber-500/10 text-amber-400 border border-amber-500/30" };
  const label = order.stage >= 3 ? "Em Inspeção" : order.stage === 2 ? "Aguardando Entrega" : "Pagamento Confirmado";
  return { label, chip: "bg-blue-500/10 text-blue-400 border border-blue-500/30" };
}

export const PLATFORM_FEE_PCT = 8;

/** Dias de retenção do valor da venda antes de liberar o saque ao vendedor */
export const PAYOUT_HOLD_DAYS = 20;

export const TESTIMONIALS = [
  { nome: "Lucas M.", texto: "Comprei uma conta de Valorant e o processo de escrow foi perfeito. Recebi tudo em 2 dias e a garantia GameProtect me deu total segurança.", nota: 5, jogo: "Valorant" },
  { nome: "Ana P.", texto: "Vendi minha conta de LoL em menos de uma semana. Saque via PIX caiu no mesmo dia. Melhor plataforma que já usei!", nota: 5, jogo: "League of Legends" },
  { nome: "Rafael S.", texto: "Tive um problema com um vendedor e o suporte 24/7 resolveu em horas, com reembolso total. Confiança absoluta.", nota: 5, jogo: "Free Fire" },
  { nome: "Juliana C.", texto: "O sistema de selos de verificação dos vendedores ajuda demais na hora de escolher. Comprei minha conta OG de Fortnite sem medo.", nota: 4, jogo: "Fortnite" },
] as const;
