# ── Stage 1: Build ───────────────────────────────────────
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

COPY . .

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV TSC_COMPILE_ON_ERROR=true

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────
FROM nginx:1.25-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# SPA-friendly nginx config: serve index.html for all routes
COPY --from=build /app/build /usr/share/nginx/html

RUN mkdir -p /etc/nginx/templates && printf 'server {\n\
    listen $PORT default_server;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location /static/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;\n\
    gzip_min_length 256;\n\
}\n' > /etc/nginx/templates/default.conf.template

EXPOSE $PORT

CMD ["nginx", "-g", "daemon off;"]
