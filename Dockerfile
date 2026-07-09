# Use the official Microsoft Playwright base image which includes Node.js and OS-level browser dependencies
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies first
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Download the correct Chromium browser binary matching the installed Playwright version
RUN npx playwright install chromium

# Copy the rest of the application files (excluding files in .dockerignore)
COPY . .

# Default configuration to run headless in a Docker container
ENV HEADLESS=true

# Keep the container running in the background indefinitely so that cron jobs can execute the script inside it
CMD ["sleep", "infinity"]