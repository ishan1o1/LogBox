# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# Use a full Node image to install ALL deps (including devDeps) and build Vite
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker layer-caches the install step
COPY package*.json ./
RUN npm ci

# Pass the API origin as a build arg so VITE_API_ORIGIN is baked into the bundle.
# Default assumes the api service is accessible on port 4000 of the same host.
# Override when building: --build-arg VITE_API_ORIGIN=https://api.example.com
ARG VITE_API_ORIGIN=http://localhost:4000
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}

COPY . .
RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
# Lightweight Nginx image — only the built dist/ folder is copied
FROM nginx:1.27-alpine AS runner

# Remove the default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy our Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the Vite build output from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
