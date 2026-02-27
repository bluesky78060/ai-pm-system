FROM node:22-slim

# Install build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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

# Build
RUN pnpm -r build

# Create data directory
RUN mkdir -p /app/data

ENV PORT=3001
ENV DB_PATH=/app/data/pm.db
ENV STATIC_PATH=/app/packages/web-ui/dist

EXPOSE 3001

CMD ["node", "packages/mcp-server/dist/api-server.js"]
