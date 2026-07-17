# Use official Node.js image based on Debian slim for a lightweight container
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files to install packages
COPY package*.json ./
RUN npm install

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
