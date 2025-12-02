# Stage 1: Build the Svelte application
FROM node:22-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Enable Corepack for pnpm management
RUN corepack enable pnpm

# Copy package.json and pnpm-lock.yaml to leverage Docker's caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application files
COPY . .

# Remove the development .env file if present
RUN rm -f .env

# Build the Svelte application for production
# Ensure your svelte.config.js uses an appropriate adapter like @sveltejs/adapter-node
RUN pnpm run build

# Stage 2: Create the final production image
#FROM node:22-alpine

# Set working directory
#WORKDIR /app

# Enable Corepack for pnpm management
#RUN corepack enable pnpm

# Copy only necessary production dependencies from the builder stage
#COPY --from=builder /app/package.json ./
#COPY --from=builder /app/node_modules/ node_modules/

# Copy the built application from the builder stage
#COPY --from=builder /app/build build/

# Expose the port your Svelte app will listen on (e.g., 3000 for Node.js adapter)
EXPOSE 3000

# Command to run the Svelte application
CMD ["node", "build/index.js"]