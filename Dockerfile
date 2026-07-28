FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build


FROM node:20-alpine AS backend

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Manila
ENV PORT=5056

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY server.js ./
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app

USER node

EXPOSE 5056

CMD ["node", "server.js"]


FROM nginx:1.27-alpine AS nginx

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
