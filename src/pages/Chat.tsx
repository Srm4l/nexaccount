import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { trpc } from "../providers/trpc";
import { showToast } from "../components/gx/ui";

export default function Chat() {
  const utils = trpc.useUtils();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  // Query all chat threads
  const { data: threads, isLoading: loadingThreads } = trpc.chat.threads.useQuery(undefined, {
    enabled: !!me,
    refetchInterval: 5000, // Poll threads every 5s
  });

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [typedMessage, setTypedMessage] = useState("");

  // Query messages for active thread
  const { data: messages, isLoading: loadingMessages } = trpc.chat.messages.useQuery(
    { threadId: activeThreadId || 0 },
    { enabled: !!activeThreadId, refetchInterval: 3000 } // Poll messages every 3s
  );

  // Send message mutation
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => {
      setTypedMessage("");
      utils.chat.messages.invalidate({ threadId: activeThreadId || 0 });
      utils.chat.threads.invalidate();
    },
    onError: (err) => {
      showToast(err.message || "Erro ao enviar mensagem.", "error");
    },
  });

  const activeThread = threads?.find((t) => t.thread.id === activeThreadId);

  // Delivery Modal State
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [loginInfo, setLoginInfo] = useState("");
  const [passwordInfo, setPasswordInfo] = useState("");
  const [extraInfo, setExtraInfo] = useState("");

  const deliverMutation = trpc.orders.deliverAccount.useMutation({
    onSuccess: () => {
      showToast("Conta entregue com sucesso!", "success");
      setDeliverModalOpen(false);
      setLoginInfo("");
      setPasswordInfo("");
      setExtraInfo("");
      utils.chat.threads.invalidate();
    },
    onError: (err) => showToast(err.message, "error"),
  });

  const handleDeliver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread?.orderId) return;
    const combinedData = `Login: ${loginInfo}\nSenha: ${passwordInfo}\n${extraInfo ? `Extra: ${extraInfo}` : ""}`;
    deliverMutation.mutate({ orderId: activeThread.orderId, data: combinedData });
  };

  // View Credentials State
  const [viewCredsModalOpen, setViewCredsModalOpen] = useState(false);
  const { data: creds, isFetching: loadingCreds } = trpc.orders.viewCredentials.useQuery(
    { orderId: activeThread?.orderId || 0 },
    { enabled: viewCredsModalOpen && !!activeThread?.orderId, retry: false }
  );

  useEffect(() => {
    // Scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadId || !typedMessage.trim()) return;
    sendMutation.mutate({
      threadId: activeThreadId,
      body: typedMessage.trim(),
    });
  };

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-[#17172B] border border-[#2A2A4A] rounded-3xl text-center text-white">
        <div className="text-5xl mb-4">💬</div>
        <h2 className="text-xl font-bold mb-2">Suas Conversas</h2>
        <p className="text-[#9CA3C0] text-sm mb-6">
          Faça login para conversar com os vendedores, tirar dúvidas sobre as contas ou negociar entregas.
        </p>
        <Link to="/" className="inline-block bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition w-full">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white min-h-[80vh] flex flex-col">
      <h1 className="text-3xl font-black mb-1">💬 Chat de Negociações</h1>
      <p className="text-[#9CA3C0] text-sm mb-6">Converse com compradores e vendedores com segurança dentro da plataforma.</p>

      <div className="flex-1 bg-[#17172B] border border-[#2A2A4A] rounded-3xl overflow-hidden flex min-h-[500px] h-[650px]">
        {/* LADO ESQUERDO: THREADS */}
        <div className="w-80 border-r border-[#2A2A4A] flex flex-col shrink-0">
          <div className="p-4 font-bold border-b border-[#2A2A4A] text-sm">Suas Conversas</div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#2A2A4A]/50">
            {loadingThreads ? (
              <div className="p-4 text-xs text-[#9CA3C0]">Carregando conversas...</div>
            ) : threads?.length === 0 ? (
              <div className="p-4 text-xs text-[#9CA3C0]">Nenhuma conversa ativa.</div>
            ) : (
              threads?.map((t) => {
                const active = t.thread.id === activeThreadId;
                return (
                  <button
                    key={t.thread.id}
                    onClick={() => setActiveThreadId(t.thread.id)}
                    className={`w-full p-4 text-left transition flex items-center gap-3 ${
                      active ? "bg-[#1E1E35]" : "hover:bg-[#12122A]/40"
                    }`}
                  >
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00D2D3] flex items-center justify-center font-bold text-sm shrink-0">
                      {(t.other?.name || "U")[0].toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-white truncate flex items-center gap-1">
                        {t.other?.name || "Usuário"}
                        {t.other?.verified && <span title="Verificado" className="text-[#00D2D3] text-xs">✔</span>}
                      </div>
                      {t.listingTitle && (
                        <div className="text-[10px] text-[#6C5CE7] font-semibold truncate">Ref: {t.listingTitle}</div>
                      )}
                      <div className="text-xs text-[#9CA3C0] truncate mt-0.5">
                        {t.lastMessage ? t.lastMessage.body : "Inicie o chat!"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* LADO DIREITO: CHAT ATIVO */}
        <div className="flex-1 flex flex-col bg-[#0F0F1A]/40">
          {activeThread ? (
            <>
              {/* HEADER CONVERSA */}
              <div className="p-4 border-b border-[#2A2A4A] bg-[#17172B]/60 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    {activeThread.other?.name}
                    {activeThread.other?.verified && <span title="Verificado" className="text-[#00D2D3]">✔</span>}
                  </div>
                  {activeThread.listingTitle && (
                    <div className="text-xs text-[#9CA3C0]">Anúncio: {activeThread.listingTitle}</div>
                  )}
                </div>
                
                {/* ACTIONS */}
                {activeThread.orderId && activeThread.orderStatus === "pago" && activeThread.thread.sellerId === me.id && (
                  <button
                    onClick={() => setDeliverModalOpen(true)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-red-500/20"
                  >
                    📦 Entregar Conta
                  </button>
                )}
                {activeThread.orderId && ["entregue", "confirmado", "concluido"].includes(activeThread.orderStatus || "") && (
                  <button
                    onClick={() => setViewCredsModalOpen(true)}
                    className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-4 py-2 rounded-lg text-xs transition"
                  >
                    🔑 Ver Dados da Conta
                  </button>
                )}
              </div>

              {/* MENSAGENS */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {loadingMessages ? (
                  <div className="text-center text-xs text-[#9CA3C0]">Carregando mensagens...</div>
                ) : (
                  messages?.map((msg: any) => {
                    const isMine = msg.senderId === me.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] p-3 rounded-2xl text-sm leading-relaxed ${
                            isMine
                              ? "bg-[#6C5CE7] text-white rounded-tr-none"
                              : "bg-[#1E1E35] border border-[#2A2A4A] text-white rounded-tl-none"
                          }`}
                        >
                          {msg.body}
                          <div className="text-[9px] text-[#9CA3C0] mt-1 text-right">
                            {new Date(msg.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* FORMULÁRIO ENVIAR MENSAGEM */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-[#2A2A4A] bg-[#17172B] flex gap-2">
                <input
                  type="text"
                  required
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7]"
                />
                <button
                  type="submit"
                  disabled={sendMutation.isPending || !typedMessage.trim()}
                  className="bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold px-6 py-3 rounded-xl transition disabled:opacity-50 text-sm"
                >
                  Enviar
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="text-5xl mb-3">💬</div>
              <h3 className="font-bold text-white text-base">Selecione uma conversa</h3>
              <p className="text-[#9CA3C0] text-sm mt-1">Escolha um contato na lista para iniciar as negociações.</p>
            </div>
          )}
        </div>
      </div>

      {/* DELIVER MODAL */}
      {deliverModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6 max-w-md w-full relative">
            <h3 className="text-xl font-black text-white mb-2">Entregar Conta</h3>
            <p className="text-[#9CA3C0] text-sm mb-6">
              Preencha os dados abaixo. Eles serão criptografados (AES-256) e armazenados com segurança. NUNCA envie dados pelo chat!
            </p>
            <form onSubmit={handleDeliver} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] mb-1">Login / Email da Conta</label>
                <input type="text" required value={loginInfo} onChange={e => setLoginInfo(e.target.value)} className="w-full bg-[#0F0F1A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-white focus:border-[#6C5CE7] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] mb-1">Senha</label>
                <input type="text" required value={passwordInfo} onChange={e => setPasswordInfo(e.target.value)} className="w-full bg-[#0F0F1A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-white focus:border-[#6C5CE7] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#9CA3C0] mb-1">Dados Extras (Ex: Código 2FA, Email de Recuperação)</label>
                <textarea rows={3} value={extraInfo} onChange={e => setExtraInfo(e.target.value)} className="w-full bg-[#0F0F1A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-white focus:border-[#6C5CE7] outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setDeliverModalOpen(false)} className="flex-1 bg-[#1E1E35] hover:bg-[#2A2A4A] text-white font-bold py-3 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={deliverMutation.isPending} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition">
                  {deliverMutation.isPending ? "Criptografando..." : "Entregar de forma segura"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW CREDS MODAL */}
      {viewCredsModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#17172B] border border-[#2A2A4A] rounded-3xl p-6 max-w-md w-full relative">
            <h3 className="text-xl font-black text-white mb-2">Dados da Conta</h3>
            <p className="text-[#9CA3C0] text-sm mb-6">
              Estes são os dados de acesso fornecidos pelo vendedor. Altere-os imediatamente no jogo para garantir sua posse!
            </p>
            {loadingCreds ? (
              <div className="py-8 text-center text-[#9CA3C0]">Descriptografando dados...</div>
            ) : (
              <div className="bg-[#0F0F1A] border border-[#2A2A4A] rounded-xl p-4 whitespace-pre-wrap text-white font-mono text-sm leading-relaxed mb-6 select-all">
                {creds?.data || "Dados indisponíveis."}
              </div>
            )}
            <button onClick={() => setViewCredsModalOpen(false)} className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold py-3 rounded-xl transition">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
