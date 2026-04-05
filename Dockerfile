FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3800

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/data ./data

EXPOSE 3800
CMD ["npm", "run", "start"]
