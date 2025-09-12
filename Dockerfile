# Use specific Node.js version for reproducibility
FROM node:20.11.1-bullseye

# Set locale and timezone for reproducibility
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV TZ=UTC

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with exact versions
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Set user for security
USER node

# Start the application
CMD ["npm", "start"]