# Development Dockerfile for Next.js frontend (ARM optimized, glibc-based)
# --platform=linux/arm64 flag should be used when building for ARM yes I want

FROM --platform=linux/arm64 node:20-slim AS dev-arm64

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only package files initially for caching
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# Copy the full app source (rest of the files)
COPY . .

# Set Hugging Face cache directory
ENV HF_HOME=/tmp/hf
ENV TRANSFORMERS_CACHE=/tmp/hf

RUN mkdir -p /tmp/hf && chmod -R 777 /tmp/hf

# Clear any old corrupted cache before preloading (more aggressive)
RUN pnpm tsx scripts/clear-old-cache.mts || true
# Also manually remove the specific corrupted file if it exists
RUN rm -rf /app/node_modules/.pnpm/@huggingface+transformers@*/node_modules/@huggingface/transformers/.cache/sentence-transformers/all-MiniLM-L6-v2/onnx/model.onnx 2>/dev/null || true
RUN rm -rf /app/node_modules/@huggingface/transformers/.cache/sentence-transformers/all-MiniLM-L6-v2/onnx/model.onnx 2>/dev/null || true

# Pre-download the embedding model at build time
RUN pnpm tsx scripts/preload-model.mts

# Use root for compatibility with bind mounts (hot reload, etc)
USER root

# Expose dev server port
EXPOSE 3001

# Start Next.js in development mode
CMD ["pnpm", "dev"]

