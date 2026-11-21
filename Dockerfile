FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src src
COPY public public
USER node
CMD ["node","src/server.mjs"]
