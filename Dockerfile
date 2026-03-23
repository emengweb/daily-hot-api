FROM docker.1ms.run/oven/bun:1-alpine
#FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY src ./src

RUN bun install
RUN bun run build

EXPOSE 4000

CMD ["bun", "run", "start"]