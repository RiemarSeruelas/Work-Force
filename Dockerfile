FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install -D vite@5.4.11 @vitejs/plugin-react@4.3.4

COPY . .

RUN node ./node_modules/vite/bin/vite.js build

ENV NODE_ENV=production
ENV PORT=5056

EXPOSE 5056

CMD ["node", "server.js"]