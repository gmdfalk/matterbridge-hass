# Build context is an isolated staging directory containing core/ and plugin/.
FROM node:22-bookworm-slim
WORKDIR /work/core
COPY core/ ./
RUN npm ci --no-fund --no-audit && npm run build
WORKDIR /work/plugin
COPY plugin/ ./
RUN npm ci --no-fund --no-audit && npm link /work/core --no-fund --no-audit && npm run build
ENV METRICS_ENABLED=false
CMD ["node", "/work/plugin/scripts/metrics-smoke/fixture.mjs"]
