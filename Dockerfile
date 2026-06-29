FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

# Build TypeScript for production
COPY tsconfig.json ./
COPY index.ts ./
RUN npm run build

COPY . .

# Persist SQLite database across container restarts
VOLUME ["/app/data"]

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
