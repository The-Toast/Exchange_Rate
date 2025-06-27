FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm install

COPY . .

RUN npm run build

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "dist/index.js"]
