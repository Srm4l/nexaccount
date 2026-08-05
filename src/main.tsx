import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { TRPCProvider } from "@/providers/trpc";
import { AuthModalProvider } from "@/components/gx/AuthModal";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <AuthModalProvider>
          <App />
        </AuthModalProvider>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
);
