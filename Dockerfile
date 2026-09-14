# GenTube — image de service.
#
# **Ce qu'elle contient et ce qu'elle ne contient pas.** Elle sert
# l'application Next : les écrans, les actions serveur, les routes internes.
# Elle ne monte pas les vidéos — le montage part sur Lambda par Step Functions
# (`lib/render/service.ts`), et le serveur ne fait que démarrer l'exécution.
# C'est ce qui la garde sous les 400 Mo : embarquer hyperframes tirerait
# puppeteer, un Chrome, ffmpeg et onnxruntime, soit plus d'un gigaoctet.
#
# Trois étages, pour ne pas réinstaller les dépendances à chaque changement de
# code : `deps` ne dépend que des manifestes, `build` du code, `run` du
# résultat.

# ─────────────────────────────── deps ────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# `libc6-compat` : les binaires natifs de Next (swc) sont construits contre
# glibc, et Alpine n'a que musl.
RUN apk add --no-cache libc6-compat

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─────────────────────────────── build ───────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Le build passe sous 2 Go de tas, à froid, avec webpack. Turbopack en
# demandait davantage et le worker Next se cognait au plafond ; webpack, lui,
# tient dans la RAM d'un VPS. Même valeur que le script `build` du
# package.json, répétée ici parce que l'image peut être construite sur une
# machine qui n'a pas les mêmes réglages.
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV NEXT_TELEMETRY_DISABLED=1

# La sortie `standalone` produit un serveur qui embarque ses seules
# dépendances utiles : l'étage final n'a pas besoin de `node_modules`.
RUN pnpm build

# ──────────────────────────────── run ────────────────────────────────
FROM node:24-alpine AS run
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Un serveur qui reçoit du public ne tourne pas en root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Pas de `curl` dans l'image : la sonde passe par le Node qui est déjà là.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sign-in').then(r=>process.exit(r.ok||r.status===307?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
