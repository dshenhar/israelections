# Self-hosting alternative to Vercel. Without DATABASE_URL, data lives in an embedded Postgres under /data.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY api ./api
COPY public ./public
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/index.js"]
