ARG BUILD_ZK=0

# Multi-stage build: Rust builder stage (optional)
FROM rust:1.82-bullseye as rust-builder
ARG BUILD_ZK

# Install build dependencies (include unzip for RISC Zero artifact verification)
RUN apt-get update && apt-get install -y \
    build-essential \
    g++ \
    clang \
    cmake \
    pkg-config \
    libssl-dev \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install nightly Rust for edition2024 support
RUN rustup toolchain install nightly
RUN rustup default nightly

# Set environment variables for C++ compilation
ENV CC=clang
ENV CXX=clang++

# Install RISC Zero toolchain only when building ZK components.
# This avoids failures when BUILD_ZK=0 and keeps default build fast.
RUN if [ "$BUILD_ZK" = "1" ]; then \
            echo "[zk] Installing RISC Zero toolchain (aarch64 workaround)" && \
            # Set environment for reliable builds
            export CARGO_NET_RETRY=10 && \
            export CARGO_HTTP_MULTIPLEXING=false && \
            # Install cargo-risczero from crates.io (stable version)
            cargo install cargo-risczero --version 3.0.3 --locked && \
            # Create comprehensive risc0 toolchain directory structure
            mkdir -p /root/.risc0/toolchains/risc0/bin && \
            mkdir -p /root/.risc0/toolchains/risc0/lib && \
            # Create dummy toolchain files to satisfy build scripts
            echo '#!/bin/bash' > /root/.risc0/toolchains/risc0/bin/rustc && \
            echo 'exec rustc "$@"' >> /root/.risc0/toolchains/risc0/bin/rustc && \
            chmod +x /root/.risc0/toolchains/risc0/bin/rustc && \
            # Verify installation
            cargo risczero --version; \
        else \
            echo "[zk] Skipping cargo-risczero install (BUILD_ZK!=1)"; \
        fi

# Set RISC Zero environment variables globally when ZK is enabled
ENV RISC0_TOOLCHAIN_VERSION="3.0.3"
ENV RISC0_DEV_MODE=1
ENV RISC0_TOOLCHAIN_PATH="/root/.risc0/toolchains/risc0"
ENV RISC0_SKIP_TOOLCHAIN_INSTALL=1
ENV CARGO_TARGET_RISCV32IM_RISC0_ZKVM_ELF_RUNNER="/usr/local/cargo/bin/r0vm"

# Always add the target explicitly so that if user later copies in prebuilt ELF or switches BUILD_ZK, the target exists.
RUN rustup target add riscv32im-risc0-zkvm-elf || echo "[zk] Warning: could not add riscv32im target (may be added by cargo-risczero when enabled)"

# Copy ZK source code and build with native CPU optimization
COPY zk/ /app/zk/
WORKDIR /app/zk

# Set RUSTFLAGS for native CPU optimization (Apple M3 Pro optimized)
ENV RUSTFLAGS="-C target-cpu=native"

# Build guest and host in release mode (or create stub if disabled)
RUN if [ "$BUILD_ZK" = "1" ]; then \
            echo "[zk] Building guest first" && \
            cargo build --release -p guest && \
            echo "[zk] Building methods" && \
            cargo build --release -p methods && \
            echo "[zk] Building host" && \
            cargo build --release -p host ; \
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