# Multi-stage build for React app
FROM node:18-alpine AS client-build

# Build the React client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Build the final image with Node.js server
FROM node:18-alpine

# Install dependencies for the server
WORKDIR /app
COPY server/package*.json ./
RUN npm install --only=production

# Copy server source code
COPY server/ ./

# Copy built React app to serve as static files
COPY --from=client-build /app/client/build ./public

# Expose port
EXPOSE 5001

# Start the server
CMD ["npm", "start"]
