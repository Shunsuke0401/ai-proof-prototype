# Use specific Node.js version for reproducibility
FROM node:20.11.1-bullseye

# Set locale and timezone for reproducibility
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV TZ=UTC

# Install system dependencies
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

# Build the Next.js application
RUN npm run build

# Ensure PATH includes our bin directory
ENV PATH="/app/bin:${PATH}"

# Expose port
EXPOSE 3000

# Start the application (keep as root for ZK operations)
CMD ["npm", "start"]