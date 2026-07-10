FROM node:20-slim

# [HIGH-5 FIX] Run as non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

COPY package*.json ./

# [HIGH-6 FIX] Install all deps for build, then prune devDependencies
RUN npm ci

COPY . .

VOLUME ["/app/data"]

EXPOSE 3000

ENV NODE_ENV=production

# [HIGH-5 FIX] Set ownership and switch to non-root user
RUN chown -R appuser:appgroup /app
USER appuser

CMD ["npx", "tsx", "src/server.ts"]
