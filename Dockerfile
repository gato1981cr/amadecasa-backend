# ~/programas/react/amade/api/Dockerfile
# syntax=docker/dockerfile:1

########################
# Base (instala deps)
########################
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

########################
# Desarrollo (nodemon)
########################
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3001
# nodemon ya debe estar en devDependencies; si no, descomenta:
# RUN npm i -g nodemon
CMD ["npm","run","dev"]

########################
# Producción (ligero)
########################
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
CMD ["node","index.js"]
