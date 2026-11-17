FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["node", "src/index.js"]
