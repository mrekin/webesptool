# Stage 1: Build the Svelte application
FROM node:22-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Enable Corepack for pnpm management
RUN corepack enable pnpm

# Copy package.json and pnpm-lock.yaml to leverage Docker's caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies using pnpm with optimizations
RUN pnpm install --frozen-lockfile --prod=false

# Copy the rest of the application files (excluding .dockerignore patterns)
COPY . .

# Remove the development .env file if present
RUN rm -f .env

# Build the Svelte application for production
# Ensure your svelte.config.js uses an appropriate adapter like @sveltejs/adapter-node
# BASE_PATH будет установлен только в runtime
RUN pnpm run build

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

# Copy package.json for production dependencies
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy the built application from the builder stage
COPY --from=builder --chown=svelte:nodejs /app/build ./build

# Switch to non-root user
USER svelte

# Expose the port your Svelte app will listen on (e.g., 3000 for Node.js adapter)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Command to run the Svelte application
CMD ["node", "build/index.js"]