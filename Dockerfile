FROM node:20-bookworm

# Ferramentas de build para o better-sqlite3 (compila o binário nativo)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build do frontend (Vite) + bundle do servidor (esbuild) → dist/
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Diretório persistente do banco SQLite
RUN mkdir -p /data && chmod +x docker-start.sh
CMD ["bash", "docker-start.sh"]
