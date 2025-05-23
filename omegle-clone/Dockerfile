# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy backend package.json and package-lock.json (if available)
COPY backend/package*.json ./backend/

# Install backend dependencies
# Using (cd backend && npm install) to ensure node_modules is in backend/
RUN cd backend && npm install --omit=dev

# Copy the rest of the backend source code
COPY backend/ ./backend/

# Copy frontend code
COPY frontend/ ./frontend/

# Make port 3000 available to the world outside this container
# The server uses process.env.PORT || 3000, so this can be overridden at runtime.
EXPOSE 3000

# Define the command to run your app
CMD ["node", "backend/server.js"]
