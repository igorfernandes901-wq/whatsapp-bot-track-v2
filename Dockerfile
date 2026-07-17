# Use official Node.js image based on Debian slim for a lightweight container
FROM node:20-slim

# Install system dependencies required for headless Chromium/Puppeteer execution on Linux
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxtst6 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files to install packages
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Run production build (Vite + esbuild server compilation)
RUN npm run build

# Expose port 3000 as required by the reverse proxy and server binding
EXPOSE 3000

# Set default production environment variables
ENV PORT=3000
ENV NODE_ENV=production
# Persistent paths designed to be mounted to a persistent volume (e.g. /data)
ENV DATABASE_PATH="/data/tracktool.db"
ENV WHATSAPP_SESSION_PATH="/data/whatsapp_session"

# Start the application
CMD ["npm", "start"]
