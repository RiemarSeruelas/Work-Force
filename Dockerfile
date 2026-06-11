FROM node:20-alpine

WORKDIR /app

ENV TZ=Asia/Manila

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV PORT=5056
EXPOSE 5056

CMD ["node", "server.js"]
