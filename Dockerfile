FROM oven/bun:1.2.10-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY . ./

ENTRYPOINT ["bun", "run", "src/index.ts"]
