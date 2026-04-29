FROM node:20-alpine
WORKDIR /opt/gescall/back
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p logs
EXPOSE 3001
CMD ["node", "server.js"]
