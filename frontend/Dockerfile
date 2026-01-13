# Stage 1: Build the Svelte application
FROM node:22-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Enable Corepack for pnpm management
RUN corepack enable pnpm

# Copy package.json and pnpm-lock.yaml to leverage Docker's caching
COPY package.json pnpm-lock.yaml ./

# Copy local packages directory (required for @meshtastic/* packages)
COPY local-packages ./local-packages

# Install dependencies using pnpm with optimizations
RUN pnpm install --frozen-lockfile --prod=false

# Copy the rest of the application files (excluding .dockerignore patterns)
COPY . .

# Remove the development .env file if present
RUN rm -f .env

# Set build argument for app version
ARG APP_VERSION

# Build the Svelte application for production with version
RUN VITE_APP_VERSION=$APP_VERSION pnpm run build

# Stage 2: Create the final production image
FROM node:22-alpine AS runner

# Set environment to production
ENV NODE_ENV=production

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 svelte

# Set working directory
WORKDIR /app

# Enable Corepack for pnpm management
RUN corepack enable pnpm

# Copy only necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/build ./build/
COPY --from=builder /app/.svelte-kit/output/server ./server/
COPY --from=builder /app/local-packages ./local-packages/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Switch to non-root user
USER svelte

# Set CI environment variable for pnpm
ENV CI=true

# Expose the port your Svelte app will listen on (e.g., 3000 for Node.js adapter)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Command to run the Svelte application
CMD ["node", "build/index.js"]