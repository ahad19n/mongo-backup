FROM node:20-slim
WORKDIR /usr/src/app

RUN apt-get update \
&& apt-get install -y --no-install-recommends mongodb-clients zip ca-certificates \
&& rm -rf /var/lib/apt/lists/*

COPY package*.json .
RUN npm ci --production

COPY . .
RUN chmod +x entrypoint.sh

VOLUME ["/backup"]
ENTRYPOINT ["./entrypoint.sh"]