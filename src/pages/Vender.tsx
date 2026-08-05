import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { trpc } from "../providers/trpc";
import { GAMES } from "../../contracts/constants";
import { useAuthModal } from "../components/gx/AuthModal";
import { showToast } from "../components/gx/ui";

export default function Vender() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const { open } = useAuthModal();

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  const { data: listingData, isLoading } = trpc.listings.byId.useQuery(
    { id: parseInt(id || "0") },
    { enabled: isEditing, retry: false }
  );

  // Form states
  const [gameId, setGameId] = useState("lol");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [level, setLevel] = useState("");
  const [rank, setRank] = useState("");
  const [server, setServer] = useState("BR");
  const [skins, setSkins] = useState("");
  const [hours, setHours] = useState("");
  const [extras, setExtras] = useState("");
  const [emailChangeable, setEmailChangeable] = useState(true);
  const [tfaTransferable, setTfaTransferable] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState("24h");

  useEffect(() => {
    if (isEditing && listingData?.listing) {
      const l = listingData.listing;
      setGameId(l.gameId);
      setTitle(l.title);
      setDescription(l.description);
      setPrice(l.price.toString());
      setLevel(l.level ? l.level.toString() : "");
      setRank(l.rank);
      setServer(l.server);
      setSkins(l.skins ? l.skins.toString() : "");
      setHours(l.hours ? l.hours.toString() : "");
      setExtras(l.extras || "");
      setEmailChangeable(l.emailChangeable);
      setTfaTransferable(l.tfaTransferable);
      setPhotos(l.photos || []);
      setDeliveryTime(l.deliveryTime || "24h");
    }
  }, [listingData, isEditing]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photos.length >= 5) {
      showToast("Máximo de 5 fotos", "error");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        setPhotos((prev) => [...prev, data.url]);
      } else {
        showToast(data.error || "Erro no upload", "error");
      }
    } catch (err) {
      showToast("Falha na conexão", "error");
    } finally {
      setUploading(false);
      // Reset input value to allow uploading the same file again if removed
      e.target.value = "";
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const createListingMutation = trpc.listings.create.useMutation({
    onSuccess: (listing) => {
      showToast("Anúncio criado com sucesso! 🚀", "success");
      navigate(`/anuncio/${listing.id}`);
    },
    onError: (err) => {
      showToast(err.message || "Erro ao criar anúncio.", "error");
    },
  });

  const updateListingMutation = trpc.listings.update.useMutation({
    onSuccess: () => {
      showToast("Anúncio atualizado com sucesso! 🚀", "success");
      navigate(`/anuncio/${id}`);
    },
    onError: (err) => {
      showToast(err.message || "Erro ao atualizar anúncio.", "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) {
      open("login");
      return;
    }
    if (title.length < 15) return showToast("O título deve ter no mínimo 15 caracteres.", "error");
    if (description.length < 40) return showToast("A descrição deve ter no mínimo 40 caracteres.", "error");
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 1) return showToast("Preço mínimo é R$ 1.", "error");

    const payload = {
      gameId,
      title,
      description,
      price: priceNum,
      level: level ? parseInt(level) : 0,
      rank,
      server,
      skins: skins ? parseInt(skins) : 0,
      hours: hours ? parseInt(hours) : 0,
      extras: extras || "",
      emailChangeable,
      tfaTransferable,
      photos,
      deliveryTime,
    };

    if (isEditing) {
      updateListingMutation.mutate({ id: parseInt(id!), ...payload });
    } else {
      createListingMutation.mutate(payload);
    }
  };

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">💰</div>
        <h2 className="text-xl font-bold mb-2">Quer vender sua conta?</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Faça login para criar anúncios grátis, gerenciar suas vendas e receber saques via PIX com segurança.
        </p>
        <button
          onClick={() => open("login")}
          className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full"
        >
          Entrar ou Cadastrar
        </button>
      </div>
    );
  }

  if (isEditing && isLoading) {
    return <div className="text-center py-20 text-[#9CA3C0]">Carregando anúncio...</div>;
  }

  const isPending = createListingMutation.isPending || updateListingMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto my-8 px-4 text-white">
      <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-8 shadow-xl">
        <h1 className="text-2xl font-black mb-1">
          {isEditing ? "✏️ Editar Anúncio" : "💰 Criar Anúncio Grátis"}
        </h1>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Preencha os dados da conta. Seja detalhado e adicione fotos para atrair mais compradores!
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* GALERIA DE FOTOS */}
          <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4">
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-3">Galeria de Fotos (Max 5)</label>
            <div className="flex flex-wrap gap-4 mb-3">
              {photos.map((url, idx) => (
                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-[#2A2A4A] group">
                  <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-red-500 font-bold"
                  >
                    Excluir
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="w-24 h-24 rounded-lg border-2 border-dashed border-[#2A2A4A] flex flex-col items-center justify-center text-[#9CA3C0] hover:text-white hover:border-[#6C5CE7] cursor-pointer transition">
                  <span className="text-2xl mb-1">+</span>
                  <span className="text-[10px] font-bold uppercase">{uploading ? "Enviando..." : "Adicionar"}</span>
                  <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            <p className="text-[10px] text-[#9CA3C0]">Upload suporta imagens JPG, PNG ou WebP até 3MB. A primeira imagem será a capa do anúncio quando visualizado.</p>
          </div>

          {/* JOGO E PRAZO DE ENTREGA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Jogo Principal</label>
              <select
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              >
                {GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icone} {g.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Prazo de Entrega Garantido</label>
              <select
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              >
                <option value="1h">⚡ Entrega em 1 hora</option>
                <option value="12h">⏳ Entrega em 12 horas</option>
                <option value="24h">🕒 Entrega em 24 horas</option>
                <option value="48h">📆 Entrega em 48 horas</option>
              </select>
            </div>
          </div>

          {/* TÍTULO */}
          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Título do Anúncio</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Conta LoL Diamante II — 145 campeões, 230 skins"
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
            />
            <span className="text-[10px] text-[#9CA3C0] mt-1 block">Mínimo de 15 caracteres.</span>
          </div>

          {/* GRID ESPECIFICAÇÕES */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Rank Atual</label>
              <input
                type="text"
                required
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                placeholder="Ex: Imortal 3, Diamante II"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Nível da Conta</label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Ex: 350"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Servidor</label>
              <input
                type="text"
                required
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="Ex: BR, Global, NA"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              />
            </div>
          </div>

          {/* SKINS E HORAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Quantidade de Skins</label>
              <input
                type="number"
                value={skins}
                onChange={(e) => setSkins(e.target.value)}
                placeholder="Ex: 120"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Horas Jogadas</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: 1400"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
              />
            </div>
          </div>

          {/* DESCRIÇÃO */}
          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Descrição Detalhada</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o inventário da conta, conquistas, skins mais raras, chaveiro, etc. Nunca inclua a senha da conta aqui!"
              rows={5}
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
            />
            <span className="text-[10px] text-[#9CA3C0] mt-1 block">Mínimo de 40 caracteres.</span>
          </div>

          {/* OBSERVAÇÕES EXTRAS */}
          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Observações Adicionais (Opcional)</label>
            <input
              type="text"
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              placeholder="Ex: Passe atual completo, 4 facas compradas, etc."
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
            />
          </div>

          {/* TOGGLES SEGURANÇA */}
          <div className="bg-[#12122A] border border-[#2A2A4A] rounded-2xl p-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm font-semibold">E-mail alterável (Full Acesso)</span>
              <input
                type="checkbox"
                checked={emailChangeable}
                onChange={(e) => setEmailChangeable(e.target.checked)}
                className="w-5 h-5 accent-[#6C5CE7]"
              />
            </label>
            <hr className="border-[#2A2A4A]" />
            <label className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm font-semibold">2FA Desativado / Transferível</span>
              <input
                type="checkbox"
                checked={tfaTransferable}
                onChange={(e) => setTfaTransferable(e.target.checked)}
                className="w-5 h-5 accent-[#6C5CE7]"
              />
            </label>
          </div>

          {/* PREÇO */}
          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1.5">Preço de Venda (R$)</label>
            <input
              type="number"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ex: 850"
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7] font-black text-[#00D2D3] text-lg"
            />
            <span className="text-[10px] text-[#9CA3C0] mt-1 block">Preço mínimo de R$ 1.</span>
          </div>

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold py-4 rounded-xl transition flex items-center justify-center disabled:opacity-50"
          >
            {isPending ? "Salvando Anúncio..." : isEditing ? "✏️ Salvar Alterações" : "🚀 Publicar Anúncio"}
          </button>
        </form>
      </div>
    </div>
  );
}
