import React, { createContext, useContext, useState } from "react";
import { trpc } from "../../providers/trpc";
import { showToast } from "./ui";

type AuthModalContextType = {
  isOpen: boolean;
  activeTab: "login" | "register";
  open: (tab?: "login" | "register") => void;
  close: () => void;
};

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) throw new Error("useAuthModal must be used within AuthModalProvider");
  return context;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const open = (tab: "login" | "register" = "login") => {
    setActiveTab(tab);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);

  return (
    <AuthModalContext.Provider value={{ isOpen, activeTab, open, close }}>
      {children}
      {isOpen && <AuthModal />}
    </AuthModalContext.Provider>
  );
}

function AuthModal() {
  const { activeTab, close, open } = useAuthModal();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      showToast("Logado com sucesso!", "success");
      utils.auth.me.invalidate();
      close();
    },
    onError: (err) => {
      showToast(err.message || "Erro ao fazer login.", "error");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      showToast("Conta criada e logada!", "success");
      utils.auth.me.invalidate();
      close();
    },
    onError: (err) => {
      showToast(err.message || "Erro ao criar conta.", "error");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (activeTab === "login") {
        await loginMutation.mutateAsync({ email, password });
      } else {
        await registerMutation.mutateAsync({ name, email, password });
      }
    } catch {
      // Handled by onError
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/oauth/google";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md p-8 bg-[#17172B] border border-[#2A2A4A] rounded-2xl shadow-2xl relative">
        <button
          onClick={close}
          className="absolute top-4 right-4 text-[#9CA3C0] hover:text-white transition text-xl"
        >
          ✕
        </button>

        <div className="flex gap-4 mb-6 border-b border-[#2A2A4A]">
          <button
            onClick={() => open("login")}
            className={`pb-3 font-bold text-lg transition ${
              activeTab === "login" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0]"
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => open("register")}
            className={`pb-3 font-bold text-lg transition ${
              activeTab === "register" ? "text-[#6C5CE7] border-b-2 border-[#6C5CE7]" : "text-[#9CA3C0]"
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "register" && (
            <div>
              <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Nome Completo</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7] transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#6C5CE7] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#9CA3C0] uppercase mb-1">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#12122A] border border-[#2A2A4A] rounded-xl pl-4 pr-11 py-3 text-sm text-white outline-none focus:border-[#6C5CE7] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3C0] hover:text-white transition p-1"
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#6C5CE7] hover:bg-[#8B7CF0] text-white font-bold py-3.5 rounded-xl transition mt-2 flex items-center justify-center disabled:opacity-50"
          >
            {loading ? "Processando..." : activeTab === "login" ? "Entrar" : "Cadastrar"}
          </button>
        </form>

        <div className="relative my-6 text-center">
          <hr className="border-[#2A2A4A]" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#17172B] px-3 text-xs text-[#9CA3C0]">
            ou continue com
          </span>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full bg-white hover:bg-gray-100 text-black font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.87-.79-1.84-.79-2.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Google
        </button>
      </div>
    </div>
  );
}
