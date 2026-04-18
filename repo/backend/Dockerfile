FROM node:20-alpine

# bash + curl are required by the documented test/verification flow
# (run_tests.sh uses #!/usr/bin/env bash; curl used for smoke checks)
RUN apk add --no-cache bash curl

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src

EXPOSE 8080

CMD ["npm", "run", "start"]
