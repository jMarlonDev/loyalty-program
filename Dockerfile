FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
RUN npm install --global npm@12.1.0
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# Explicit release job: build this target when running reviewed DB migrations.
FROM build AS migration
CMD ["npm", "run", "migrate"]

FROM node:24.18.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
