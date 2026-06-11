FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5053

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 5053

CMD ["node", "server.js"]
