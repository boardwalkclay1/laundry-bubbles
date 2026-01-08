# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Cloud Run requires your app to listen on PORT=8080
ENV PORT=8080

# Expose the port (not required by Cloud Run but good practice)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
