# Build + run as a single container
FROM node:20-alpine AS deps
WORKDIR /app

# Install deps separately for better caching
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN cd server && npm install --omit=dev
RUN cd client && npm install

FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/server/node_modules server/node_modules
COPY --from=deps /app/client/node_modules client/node_modules

COPY server server
COPY client client

RUN cd client && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/server /app/server
COPY --from=build /app/client /app/client

EXPOSE 3001
CMD ["node", "server/src/index.js"]
