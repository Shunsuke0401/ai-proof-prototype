ARG BUILD_ZK=0

# Multi-stage build: Rust builder stage (optional)
FROM rust:1.82-bullseye as rust-builder
ARG BUILD_ZK

# Install build dependencies and RISC Zero toolchain in builder stage
RUN apt-get update && apt-get install -y \
    build-essential \
    g++ \
    clang \
    cmake \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install nightly Rust for edition2024 support
RUN rustup toolchain install nightly
RUN rustup default nightly

# Set environment variables for C++ compilation
ENV CC=clang
ENV CXX=clang++

# Install RISC Zero toolchain in builder stage
RUN cargo install cargo-risczero

# Copy ZK source code and build with native CPU optimization
COPY zk/ /app/zk/
WORKDIR /app/zk

# Set RUSTFLAGS for native CPU optimization (Apple M3 Pro optimized)
ENV RUSTFLAGS="-C target-cpu=native"

# Build guest and host in release mode (or create stub if disabled)
RUN if [ "$BUILD_ZK" = "1" ]; then \
            echo "[zk] Building guest + host (release)" && \
            cargo build --release -p guest -p host ; \
        else \
            echo "[zk] Skipping ZK build (BUILD_ZK!=1), creating stub" && \
            mkdir -p /app/zk/target/release && \
            printf '#!/bin/sh\necho "ZK host binary not built (BUILD_ZK=0)." >&2\nexit 1\n' > /app/zk/target/release/zkhost && \
            chmod +x /app/zk/target/release/zkhost ; \
        fi

# Production stage with Node.js
FROM node:20.11.1-bullseye as production
ARG BUILD_ZK

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV LC_ALL=C.UTF-8
ENV TZ=UTC

# (Optional) minimal runtime deps (curl already present in base image; keep clean layer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy remaining source code
COPY . .

RUN mkdir -p /app/bin
# Copy zkhost (either real or stub)
COPY --from=rust-builder /app/zk/target/release/zkhost /app/bin/zkhost

# Ensure execution permission (in case of stub copy)
RUN chmod +x /app/bin/zkhost && echo "[zk] Binary status (BUILD_ZK=$BUILD_ZK):" && ls -l /app/bin/zkhost

# Build the Next.js application
RUN npm run build

# Ensure PATH includes our bin directory
ENV PATH="/app/bin:${PATH}"

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]