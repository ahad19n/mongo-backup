# Dockerfile
FROM node:20-slim

# install mongodump (mongodb-clients) and zip
RUN apt-get update \
 && apt-get install -y --no-install-recommends mongodb-clients zip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY . .

RUN chmod +x /usr/src/app/entrypoint.sh

VOLUME ["/backup"]

ENTRYPOINT ["./entrypoint.sh"]