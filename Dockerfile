# Multi-stage build: compile the add-in, then serve it with the /proxy/ route.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Pin npm to avoid lockfile-v3 / bundled-npm drift (a known cause of partial
# installs under rootless builders like podman). Use a writable npm cache.
ENV npm_config_cache=/tmp/npm-cache
RUN npm install -g npm@10.8.2 && npm ci --no-audit --no-fund
COPY . .
# Enable the self-hosted proxy checkbox in the built app.
ENV VITE_PROXY_ENABLED=true
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const http=require('node:http');const https=require('node:https');const check=(mod,url)=>new Promise(resolve=>{const req=mod.get(url,{rejectUnauthorized:false},res=>{res.resume();resolve(res.statusCode===200)});req.on('error',()=>resolve(false));req.setTimeout(4000,()=>{req.destroy();resolve(false)})});(async()=>{if(await check(https,'https://127.0.0.1:3000/healthz'))process.exit(0);if(await check(http,'http://127.0.0.1:3000/healthz'))process.exit(0);process.exit(1)})()"
CMD ["node", "scripts/serve.mjs"]
