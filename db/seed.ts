import * as crypto from "node:crypto";
import { getDb } from "../api/queries/connection";
import * as schema from "@db/schema";
import { GAMES } from "@contracts/constants";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function createAdmin(db: ReturnType<typeof getDb>) {
  await db.insert(schema.users).values({
    unionId: "cred:admin@contagamer.gg",
    name: "Admin GX",
    email: "admin@contagamer.gg",
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "Admin@2026"),
    role: "admin",
    verified: true,
    verificationLevel: "premium",
    sellerTier: "diamante",
    memberSince: 2026,
  });
}

type SeedSeller = {
  key: string;
  name: string;
  tier: "bronze" | "prata" | "ouro" | "diamante";
  rating: number;
  sales: number;
  since: number;
  verified: boolean;
};

const SELLERS: SeedSeller[] = [
  { key: "shadow", name: "ShadowSeller", tier: "diamante", rating: 4.9, sales: 1240, since: 2019, verified: true },
  { key: "headshot", name: "HeadshotBR", tier: "ouro", rating: 4.8, sales: 640, since: 2020, verified: true },
  { key: "ffking", name: "FFKing", tier: "ouro", rating: 4.7, sales: 820, since: 2019, verified: true },
  { key: "blox", name: "BloxTrader", tier: "diamante", rating: 5.0, sales: 310, since: 2018, verified: true },
  { key: "lossantos", name: "LosSantosDealer", tier: "prata", rating: 4.6, sales: 210, since: 2021, verified: true },
  { key: "ogvault", name: "OGVault", tier: "diamante", rating: 4.9, sales: 95, since: 2020, verified: true },
  { key: "midlane", name: "MidLaneGod", tier: "ouro", rating: 4.8, sales: 455, since: 2019, verified: true },
  { key: "skinbaron", name: "SkinBaron", tier: "diamante", rating: 5.0, sales: 180, since: 2018, verified: true },
  { key: "clutch", name: "ClutchQueen", tier: "prata", rating: 4.5, sales: 96, since: 2022, verified: true },
  { key: "booyah", name: "BooyahStore", tier: "prata", rating: 4.4, sales: 340, since: 2020, verified: false },
  { key: "capecol", name: "CapeCollector", tier: "ouro", rating: 4.9, sales: 150, since: 2019, verified: true },
  { key: "nextgen", name: "NextGenDeals", tier: "bronze", rating: 4.3, sales: 45, since: 2023, verified: true },
  { key: "vault", name: "VaultHunter", tier: "ouro", rating: 4.7, sales: 220, since: 2020, verified: true },
  { key: "smurf", name: "SmurfHouse", tier: "prata", rating: 4.6, sales: 530, since: 2021, verified: true },
  { key: "limited", name: "LimitedLord", tier: "diamante", rating: 4.8, sales: 130, since: 2019, verified: true },
  { key: "fut", name: "FUTMaster", tier: "ouro", rating: 4.7, sales: 280, since: 2020, verified: true },
  { key: "legend", name: "LegendDealer", tier: "ouro", rating: 4.8, sales: 310, since: 2019, verified: true },
  { key: "pro", name: "ProAccs", tier: "diamante", rating: 4.9, sales: 75, since: 2021, verified: true },
  { key: "block", name: "BlockTrade", tier: "bronze", rating: 4.4, sales: 60, since: 2022, verified: true },
];

type SeedListing = {
  game: string; title: string; price: number; level: number; rank: string; server: string;
  skins: number; extras: string; email: boolean; tfa: boolean; hours: number;
  seller: string; rating: number; reviews: number; featured: boolean; views: number; desc: string;
};

const LISTINGS: SeedListing[] = [
  { game: "lol", title: "Conta LoL Diamante II — 145 campeões, 230 skins (12 Lendárias)", price: 1890, level: 412, rank: "Diamante II", server: "BR", skins: 230, extras: "Todas as rotas, 12 skins Lendárias, borda Diamante S13", email: true, tfa: true, hours: 3800, seller: "shadow", rating: 4.9, reviews: 87, featured: true, views: 1420, desc: "Conta main desde 2013, Diamante II no atual split com MMR alto. 145 campeões desbloqueados, 230 skins incluindo Elementalist Lux, Spirit Guard Udyr e 10 outras Lendárias. Nunca recebeu punições. Email original alterável e 2FA transferível." },
  { game: "valorant", title: "Valorant Imortal 3 — Reaver, Prime e Champions 2021", price: 2450, level: 287, rank: "Imortal 3", server: "BR", skins: 64, extras: "Reaver Vandal, Prime Collection, Champions 2021, 3 Knives", email: true, tfa: true, hours: 2100, seller: "headshot", rating: 4.8, reviews: 52, featured: true, views: 980, desc: "Imortal 3 com peak Radiant no Episódio 7. Coleção com Reaver Vandal, Prime 2.0, Champions 2021 e 3 facas. Battlepass completo de todos os episódios. Conta limpa, sem bans." },
  { game: "freefire", title: "Free Fire Nível 72 — M1887 Lua, Angelical Azul, 40k diamantes gastos", price: 790, level: 72, rank: "Mestre", server: "BR", skins: 310, extras: "Calça Angelical Azul, M1887 Lua de Sangue, 80+ emotes raros", email: true, tfa: false, hours: 4600, seller: "ffking", rating: 4.7, reviews: 64, featured: true, views: 2100, desc: "Conta veterana 2018 com Calça Angelical Azul original, M1887 Lua de Sangue e dezenas de skins de incubadora. Todos os personagens comprados, incluindo colaborações. Passe de elite completo desde a temporada 5." },
  { game: "roblox", title: "Roblox 2016 — Headless Horseman + Korblox + 45k Robux em itens", price: 3200, level: 0, rank: "Veterano 2016", server: "Global", skins: 520, extras: "Headless Horseman, Korblox Deathspeaker, Valkyrie Helm", email: true, tfa: true, hours: 5200, seller: "blox", rating: 5.0, reviews: 41, featured: true, views: 1670, desc: "Conta criada em 2016 com Headless Horseman, Korblox Deathspeaker, Valkyrie Helm e dezenas de limiteds. Inventário avaliado em 45.000 Robux. Premium ativo até 2027." },
  { game: "gta5", title: "GTA V Online Nível 800 — 400M GTA$, tudo desbloqueado", price: 1150, level: 800, rank: "Nível 800", server: "PC", skins: 0, extras: "400M GTA$, todos os veículos, todos os negócios", email: true, tfa: true, hours: 3400, seller: "lossantos", rating: 4.6, reviews: 33, featured: false, views: 740, desc: "Nível 800 legítimo, 400 milhões de GTA$ no banco, todos os negócios, hangares, bunkers e veículos. Coleção completa de carros modificados. Rockstar Social Club com email alterável." },
  { game: "fortnite", title: "Fortnite OG — Renegade Raider + Aerial Assault + 340 skins", price: 5900, level: 1450, rank: "Conta OG S1", server: "Global", skins: 340, extras: "Renegade Raider, Aerial Assault Trooper, Skull Trooper roxo", email: true, tfa: true, hours: 6100, seller: "ogvault", rating: 4.9, reviews: 28, featured: true, views: 3400, desc: "Conta da Temporada 1 com Renegade Raider e Aerial Assault Trooper. 340 skins, incluindo Skull Trooper roxo, Galaxy e Black Knight. Full access com email original." },
  { game: "lol", title: "LoL Mestre — 160 campeões, focada em mid, 95 skins", price: 1350, level: 356, rank: "Mestre", server: "BR", skins: 95, extras: "Peak Desafiante S12, 95 skins, ícones raros", email: true, tfa: true, hours: 2900, seller: "midlane", rating: 4.8, reviews: 47, featured: false, views: 860, desc: "Mestre atual com peak Desafiante na S12. Conta focada em mid com todos os campeões relevantes e 95 skins. MMR alto, vitória garantida nas séries de MD10." },
  { game: "cs2", title: "CS2 Global Elite — Karambit Doppler + 12k horas", price: 4800, level: 0, rank: "Global Elite / 25k Premier", server: "Global", skins: 85, extras: "Karambit Doppler P2, AWP Asiimov, AK Fire Serpent", email: true, tfa: true, hours: 12000, seller: "skinbaron", rating: 5.0, reviews: 22, featured: false, views: 1250, desc: "Conta Steam de 2014 com CS2 Global e 25k de rating Premier. Inventário com Karambit Doppler Phase 2, AWP Asiimov e AK Fire Serpent. Steam Guard móvel transferível." },
  { game: "valorant", title: "Valorant Diamante 3 — Champions 2022 + 45 skins", price: 980, level: 198, rank: "Diamante 3", server: "BR", skins: 45, extras: "Champions 2022 Phantom, Glitchpop, 2 Knives", email: true, tfa: true, hours: 1300, seller: "clutch", rating: 4.5, reviews: 19, featured: false, views: 410, desc: "Diamante 3 com Champions 2022 Phantom e coleção Glitchpop completa. Todos os agentes desbloqueados. Conta sem punições, email alterável." },
  { game: "freefire", title: "Free Fire Nível 68 — Angelical Branca + Cobra MP40", price: 620, level: 68, rank: "Diamante IV", server: "BR", skins: 240, extras: "Calça Angelical Branca, MP40 Cobra, 60 emotes", email: true, tfa: false, hours: 3900, seller: "booyah", rating: 4.4, reviews: 27, featured: false, views: 590, desc: "Calça Angelical Branca, MP40 Cobra e várias skins evolutivas no nível máximo. Conta de 2019, limpa e barata." },
  { game: "minecraft", title: "Minecraft Java + Capa Minecon 2015 + Hypixel MVP++", price: 2100, level: 0, rank: "Minecon 2015 Cape", server: "Java Edition", skins: 30, extras: "Capa Minecon 2015, Hypixel MVP++, Optifine Cape", email: true, tfa: true, hours: 2800, seller: "capecol", rating: 4.9, reviews: 31, featured: false, views: 890, desc: "Raríssima conta com capa Minecon 2015 e capa Optifine. Hypixel MVP++ ativo, SkyWars nível 25. Email original alterável, sem hypixel bans." },
  { game: "gta5", title: "GTA V PS5 Nível 450 — 120M + garagem completa", price: 890, level: 450, rank: "Nível 450", server: "PS5", skins: 0, extras: "120M GTA$, todos os heists, Oppressor Mk II", email: true, tfa: false, hours: 2100, seller: "nextgen", rating: 4.3, reviews: 12, featured: false, views: 380, desc: "Conta de PS5 com 120 milhões, todos os heists completos, Oppressor Mk II e garagem com 40 veículos premium. Sem modificações ilegais." },
  { game: "fortnite", title: "Fortnite 280 skins — Travis Scott + Kratos + ikonik", price: 2750, level: 890, rank: "Conta rara", server: "Global", skins: 280, extras: "Travis Scott, Kratos, Ikonik, 15 skins de passe antigos", email: true, tfa: true, hours: 4200, seller: "vault", rating: 4.7, reviews: 35, featured: false, views: 1100, desc: "280 skins incluindo Travis Scott, Kratos e Ikonik. Passes da temporada 4 em diante completos. Conta full access." },
  { game: "lol", title: "LoL Smurf Desafiante — winrate 78%, 60 campeões", price: 2200, level: 89, rank: "Desafiante", server: "BR", skins: 32, extras: "Winrate 78%, conta smurf high MMR", email: true, tfa: true, hours: 650, seller: "smurf", rating: 4.6, reviews: 58, featured: false, views: 1500, desc: "Smurf Desafiante com winrate absurdo de 78%. Ideal para quem quer uma conta com MMR perfeito para subir rápido. 60 campeões essenciais." },
  { game: "roblox", title: "Roblox Limited — Dominus Empyreus + 12 limiteds", price: 4500, level: 0, rank: "Colecionador", server: "Global", skins: 890, extras: "Dominus Empyreus, 12 limiteds avaliados em 2M Robux", email: true, tfa: true, hours: 6800, seller: "limited", rating: 4.8, reviews: 19, featured: true, views: 2300, desc: "Dominus Empyreus original e mais 12 limiteds raros. Inventário avaliado em mais de 2 milhões de Robux. Conta de colecionador desde 2014." },
  { game: "fifa", title: "EA FC 25 Ultimate Team — 92 OVR, 5M coins, Icons", price: 1450, level: 120, rank: "Divisão Elite", server: "Global", skins: 0, extras: "92 OVR squad, 5M coins, 3 Icons, Divisão Elite", email: true, tfa: true, hours: 1800, seller: "fut", rating: 4.7, reviews: 44, featured: false, views: 720, desc: "Squad 92 OVR com 3 Icons (Pelé, Zidane, Ronaldo Fenômeno), 5 milhões de coins e histórico de Divisão Elite. Conta de PS5 com EA Play." },
  { game: "cs2", title: "CS2 Premier 20k — Butterfly Fade + luvas Pandora", price: 6800, level: 0, rank: "20k Premier", server: "Global", skins: 120, extras: "Butterfly Fade 99%, Luvas Pandora's Box, AWP Dragon Lore", email: true, tfa: true, hours: 8500, seller: "legend", rating: 4.8, reviews: 16, featured: true, views: 1900, desc: "Inventário top: Butterfly Fade 99%, luvas Pandora's Box e AWP Dragon Lore. Conta Steam nível 80 com 15 anos de serviço." },
  { game: "valorant", title: "Valorant Radiante — Kuronami + Champions 2023", price: 3900, level: 340, rank: "Radiante", server: "BR", skins: 78, extras: "Kuronami Vandal, Champions 2023, 5 Knives, Radiante 2 atos", email: true, tfa: true, hours: 3200, seller: "pro", rating: 4.9, reviews: 25, featured: true, views: 1750, desc: "Radiante por 2 atos seguidos. Kuronami Vandal, Champions 2023 e 5 facas. Episódios completos desde o lançamento. Ideal para streamers." },
  { game: "minecraft", title: "Minecraft 2011 Alpha — Cape OG + Hypixel nível 300", price: 3800, level: 0, rank: "Alpha 2011", server: "Java Edition", skins: 45, extras: "Conta Alpha 2011, Vanilla Cape, Hypixel nível 300", email: true, tfa: true, hours: 9500, seller: "block", rating: 4.4, reviews: 14, featured: false, views: 620, desc: "Conta da era Alpha 2011 com capas raras e Hypixel nível 300. Histórico limpo, migração completa para Microsoft. Nome OG de 4 letras." },
  { game: "apex", title: "Apex Predator — 20k kills Wraith, heirloom x3", price: 2400, level: 500, rank: "Apex Predator", server: "Global", skins: 210, extras: "3 heirlooms, 20k kills Wraith, todos os passes", email: true, tfa: true, hours: 4800, seller: "shadow", rating: 4.9, reviews: 38, featured: false, views: 940, desc: "Apex Predator 3 temporadas, 20 mil kills com Wraith e 3 heirlooms. Todos os passes de batalha completos desde a S1." },
  { game: "fifa", title: "EA FC 25 PC — 88 OVR starter, 1.2M coins", price: 480, level: 45, rank: "Divisão 2", server: "PC", skins: 0, extras: "88 OVR, 1.2M coins, conta starter", email: true, tfa: false, hours: 400, seller: "nextgen", rating: 4.3, reviews: 9, featured: false, views: 310, desc: "Conta starter com squad 88 OVR e 1.2 milhão de coins. Perfeita para começar no FC 25 sem grind." },
  { game: "apex", title: "Apex Mestre — Heirloom Octane + 150 skins", price: 1150, level: 380, rank: "Mestre", server: "BR", skins: 150, extras: "Heirloom Octane, 150 skins, 8k kills", email: true, tfa: true, hours: 2400, seller: "clutch", rating: 4.5, reviews: 21, featured: false, views: 480, desc: "Mestre atual, heirloom do Octane e 150 skins. Conta BR com histórico limpo e 8 mil kills totais." },
  { game: "gta5", title: "GTA V PC Nível 350 — 80M + mod menu free", price: 550, level: 350, rank: "Nível 350", server: "PC", skins: 0, extras: "80M GTA$, escritório + bunker max", email: true, tfa: false, hours: 1500, seller: "lossantos", rating: 4.6, reviews: 27, featured: false, views: 520, desc: "Nível 350 com 80 milhões, escritório e bunker maximizados. Entrega rápida com email alterável." },
  { game: "roblox", title: "Roblox 2015 — Valkyrie + Sparkle Time Fedora", price: 2800, level: 0, rank: "Veterano 2015", server: "Global", skins: 340, extras: "Valkyrie Helm, Sparkle Time Fedora, 8 limiteds", email: true, tfa: true, hours: 4100, seller: "blox", rating: 5.0, reviews: 23, featured: false, views: 860, desc: "Conta de 2015 com Valkyrie Helm e Sparkle Time Fedora. 8 limiteds no inventário. Entrega segura com email original." },
];

const REVIEW_SAMPLES = [
  { nome: "Carlos M.", rating: 5, text: "Compra perfeita! Recebi a conta em menos de 2 horas, tudo conforme o anúncio. Vendedor super atencioso." },
  { nome: "Ana P.", rating: 5, text: "Já é minha terceira compra aqui. O escrow dá total segurança. Recomendo demais!" },
  { nome: "Rafael T.", rating: 4, text: "Conta entregue certinha. Só demorou um pouco mais que o previsto, mas chegou tudo ok." },
];

async function seed() {
  const db = getDb();

  const existing = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users);
  if (existing.length > 0) {
    // Banco já tem dados: garante ao menos o admin
    if (!existing.some((u: any) => u.role === "admin")) {
      await createAdmin(db);
      console.log("Admin recriado: admin@contagamer.gg");
    }
    console.log("Banco já populado — seed ignorado.");
    process.exit(0);
  }

  // Vendedores demo
  const sellerIds: Record<string, number> = {};
  for (const s of SELLERS) {
    const email = `${s.key}@contagamer.gg`;
    const [{ id }] = await db
      .insert(schema.users)
      .values({
        unionId: `cred:${email}`,
        name: s.name,
        email,
        passwordHash: hashPassword("Seller@2026"),
        sellerTier: s.tier,
        sellerRating: s.rating,
        sellerSales: s.sales,
        verified: s.verified,
        verificationLevel: s.tier === "diamante" ? "premium" : s.tier === "ouro" ? "verificado" : "basico",
        memberSince: s.since,
        role: "user",
      })
      .returning({ id: schema.users.id }).all();
    sellerIds[s.key] = id;
  }
  console.log(`Inserted ${SELLERS.length} sellers.`);

  // Autores de reviews (Compradores)
  const reviewerIds: number[] = [];
  for (const r of REVIEW_SAMPLES) {
    const email = `${r.nome.toLowerCase().replace(/\s/g, "").replace(/\./g, "")}@contagamer.gg`;
    const unionId = `cred:${email}`;
    const [{ id }] = await db
      .insert(schema.users)
      .values({
        unionId,
        name: r.nome,
        email,
        passwordHash: hashPassword("Comprador@2026"),
        role: "user",
      })
      .returning({ id: schema.users.id }).all();
    reviewerIds.push(id);
  }

  for (const l of LISTINGS) {
    const [{ id: listingId }] = await db
      .insert(schema.listings)
      .values({
        sellerId: sellerIds[l.seller],
        gameId: l.game,
        title: l.title,
        description: l.desc,
        price: l.price,
        level: l.level,
        rank: l.rank,
        server: l.server,
        skins: l.skins,
        hours: l.hours,
        extras: l.extras,
        emailChangeable: l.email,
        tfaTransferable: l.tfa,
        featured: l.featured,
        views: l.views,
        rating: l.rating,
        reviewCount: l.reviews,
        status: "ativo",
      })
      .returning({ id: schema.listings.id }).all();
    for (let i = 0; i < REVIEW_SAMPLES.length; i++) {
      await db.insert(schema.reviews).values({
        listingId,
        authorId: reviewerIds[i],
        rating: REVIEW_SAMPLES[i].rating,
        text: REVIEW_SAMPLES[i].text,
      });
    }
  }
  console.log(`Inserted ${LISTINGS.length} listings with reviews.`);

  // Categorias de jogos (editáveis pelo admin)
  for (let i = 0; i < GAMES.length; i++) {
    const g = GAMES[i];
    await db.insert(schema.games).values({
      id: g.id, nome: g.nome, icone: g.icone,
      grad1: g.grad[0], grad2: g.grad[1], cor: g.cor,
      ordem: i, ativo: true,
    });
  }
  console.log(`Inserted ${GAMES.length} games.`);

  // Conta admin (troque a senha no primeiro acesso!)
  await createAdmin(db);
  console.log("Admin criado: admin@contagamer.gg");

  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
