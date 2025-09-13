# Multi-stage build: Rust builder stage
FROM rust:1.82-bullseye as rust-builder

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

# Copy ZK source code and build
COPY zk/ /app/zk/
WORKDIR /app/zk
RUN cargo build --release

# Production stage with Node.js
FROM node:20.11.1-bullseye as production

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV LC_ALL=C.UTF-8
ENV TZ=UTC

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy remaining source code
COPY . .

# Copy built ZK binaries from builder stage
RUN mkdir -p /app/bin
COPY --from=rust-builder /app/zk/target/release/zkhost /app/bin/zkhost

# Make binaries executable
RUN chmod +x /app/bin/zkhost

# Build the Next.js application
RUN npm run build

# Ensure PATH includes our bin directory
ENV PATH="/app/bin:${PATH}"

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]