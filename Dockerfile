FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
  chromium-browser \
  wget \
  ca-certificates \
  fonts-liberation \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  libglib2.0-0 \
  libasound2 \
  libxshmfence1 \
  libxext6 \
  libxfixes3 \
  libpango1.0-0 \
  libcairo2 \
  libxcb1 \
  libx11-6 \
  libxrender1 \
  libxcb-dri3-0 \
  libxcb-dri2-0 \
  libxcb-glx0 \
  libxss1 \
  libxtst6 \
  libnss3 \
  libxrandr2 \
  libgbm1 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm install

COPY . .

RUN npm run build

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "dist/index.js"]
