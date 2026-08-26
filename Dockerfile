FROM oven/bun:1.3.0-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY . ./

ENTRYPOINT ["bun", "run", "src/index.ts"]
