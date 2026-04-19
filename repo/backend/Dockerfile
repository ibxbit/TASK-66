FROM node:20-alpine

# bash + curl are required by the documented test/verification flow
# (run_tests.sh uses #!/usr/bin/env bash; curl used for smoke checks)
RUN apk add --no-cache bash curl

WORKDIR /app

# Copy manifests first so this layer is cached unless dependencies change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080

CMD ["npm", "run", "start"]
