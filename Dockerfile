# =============================================================================
# Server Log Insights Tracking — Docker image for E2E bot-detection tests
# =============================================================================
# Base: official Playwright image (Node 22 + all browsers pre-installed)
# Adds: nginx to serve the test page at the expected URL path
# =============================================================================

FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Install nginx for static file serving
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for tests)
RUN npm ci

# Copy the rest of the project
COPY . .

# Configure nginx to serve the project at /server-log-insights-tracking/
COPY nginx.conf /etc/nginx/sites-available/default

# Create output directory for results
RUN mkdir -p /app/output

# Entrypoint script: start nginx, run tests, write results to file
RUN printf '#!/bin/bash\nset -e\nnginx\necho "Nginx started — serving at http://127.0.0.1/server-log-insights-tracking/"\nnpx playwright test "$@" 2>&1 | tee /app/output/test-results.txt\nexit ${PIPESTATUS[0]}\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
