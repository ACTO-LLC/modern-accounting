FROM node:20-alpine

# Install git for simple-git operations
RUN apk add --no-cache git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Set default environment variables
ENV NODE_ENV=production
ENV POLL_INTERVAL_MS=300000

# Run the monitor agent
CMD ["npm", "start"]
