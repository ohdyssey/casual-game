# PlayPOP API — Cloud Run 컨테이너.
#
# 빌드 컨텍스트는 **모노레포 루트**여야 한다(npm workspaces 라 루트 package-lock.json 필요):
#   docker build -f apps/api/Dockerfile -t <image> .
#
# 빌드 단계 없음(tsx 로 TS 를 직접 실행) — apps/api/tsconfig.json 이 noEmit:true 인 것과 같은 이유
# (지금은 배포 파이프라인 단순화 우선, 컨테이너 시작 시간이 문제가 되면 esbuild 빌드 단계 추가 검토).
FROM node:22-slim

WORKDIR /app

# 워크스페이스 해석에 필요한 최소 파일만 먼저 복사 — 의존성 캐시가 소스 변경에 안 깨지게.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

# tsx 는 devDependency 이지만 런타임에 필요하다(빌드 단계 없이 TS 를 직접 실행하므로) — omit=dev 안 함.
RUN npm ci --workspace=@playpop/api --ignore-scripts

COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 8080
ENV PORT=8080

CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
