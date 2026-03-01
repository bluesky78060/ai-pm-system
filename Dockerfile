FROM node:22-slim

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/web-ui/package.json packages/web-ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/mcp-server/ packages/mcp-server/
COPY packages/web-ui/ packages/web-ui/

# Build sequentially with memory limit for Render free tier (512MB)
ENV NODE_OPTIONS="--max-old-space-size=384"
RUN pnpm --filter @ai-pm/mcp-server build
RUN pnpm --filter @ai-pm/web-ui build

ENV PORT=3001
ENV STATIC_PATH=/app/packages/web-ui/dist

EXPOSE 3001

CMD ["node", "--max-old-space-size=384", "packages/mcp-server/dist/api-server.js"]
