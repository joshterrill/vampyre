# Dockerfile for Secure JavaScript Instrumentation
#
# Usage:
#   docker build -t vampyre-instrument .
#   docker run --rm -v $(pwd):/workspace vampyre-instrument <malware.js> --output <output.js> [--no-execute] [--report-console]
#
# This will run instrument.js inside a secure container, saving output and logs to your local directory.

FROM node:20-alpine

# Create a non-root user for security
RUN adduser -D vampyre
USER vampyre

WORKDIR /workspace

# Copy only package.json and install dependencies first for better caching
COPY --chown=vampyre package.json ./
RUN npm install --omit=dev

# Copy the instrumenter script
COPY --chown=vampyre instrument.js ./

# Entrypoint for running the instrumenter
ENTRYPOINT ["node", "instrument.js"]
