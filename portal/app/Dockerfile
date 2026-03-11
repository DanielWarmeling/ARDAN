FROM node:18

RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
COPY frontend/public /app/public
COPY middlewares /app/middlewares
COPY entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh

RUN chmod +x /entrypoint.sh /wait-for.sh && mkdir -p /app/uploads

EXPOSE 7071

CMD ["/entrypoint.sh"]
