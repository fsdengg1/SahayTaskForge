FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN node -e "const u=process.env.VITE_API_URL||''; if(!u.startsWith('https://')) { console.error('VITE_API_URL must be an https URL'); process.exit(1); }"
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
