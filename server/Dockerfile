FROM node:18-alpine

RUN apk add --no-cache curl net-tools

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3002

ENV NODE_DEBUG=*
CMD ["npm", "start"]