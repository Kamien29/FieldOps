FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=3000 DB_FILE=/data/fieldops.db
# IMPORTANT: set a real secret in production: docker run -e TOKEN_SECRET=...
VOLUME /data
EXPOSE 3000
CMD ["node", "src/index.js"]
