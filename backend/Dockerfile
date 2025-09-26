FROM oven/bun:1.1.21
WORKDIR /app
COPY package.json bun.lock package-lock.json tsconfig.json ./
RUN bun install
COPY . .
EXPOSE 4000
CMD ["bun", "src/index.ts"]
