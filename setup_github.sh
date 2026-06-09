#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${REPO_NAME:-multichannel-document-intelligence-platform}"
VISIBILITY="${VISIBILITY:-public}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required. Install gh and run: gh auth login" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

OWNER="$(gh api user --jq .login)"
OWNER_ID="$(gh api user --jq .id)"

git init
git config user.name "${GIT_AUTHOR_NAME:-$OWNER}"
git config user.email "${GIT_AUTHOR_EMAIL:-$OWNER_ID+$OWNER@users.noreply.github.com}"

git add .dockerignore .gitattributes .gitignore .env.example .nvmrc .python-version LICENSE package.json
git commit -m "chore: initialize document intelligence monorepo"

git add infra/db/init.sql infra/policies packages/shared/contracts
git commit -m "infra: add normalized document intelligence schema"

git add docker-compose.yml storage/.gitkeep
git commit -m "infra: add isolated Postgres Redis and worker topology"

git add package-lock.json apps/web/package.json apps/web/tsconfig.json apps/web/next.config.mjs apps/web/next-env.d.ts apps/web/Dockerfile apps/web/public apps/web/eslint.config.mjs apps/web/.prettierrc apps/web/.prettierignore apps/web/src/app/layout.tsx apps/web/src/app/page.tsx
git commit -m "feat(gateway): scaffold Next.js ingestion control plane"

git add apps/web/src/lib/config.ts apps/web/src/lib/db.ts apps/web/src/lib/queue.ts
git commit -m "feat(gateway): add Postgres and Redis stream adapters"

git add apps/web/src/lib/documents.ts
git commit -m "feat(gateway): persist document versions and ingestion runs"

git add apps/web/src/app/api/documents/route.ts apps/web/src/app/api/documents/[id]/route.ts
git commit -m "feat(gateway): expose asynchronous document APIs"

git add apps/web/src/lib/documents.test.ts apps/web/src/app/api/documents/route.test.ts apps/web/src/app/api/documents/route.integration.test.ts apps/web/vitest.config.ts
git commit -m "test(gateway): cover document admission and integration flow"

git add services/engine/pyproject.toml services/engine/Dockerfile services/engine/document_engine/__init__.py services/engine/document_engine/config.py services/engine/document_engine/db.py services/engine/document_engine/main.py
git commit -m "feat(engine): scaffold FastAPI extraction worker"

git add services/engine/document_engine/extractor.py
git commit -m "feat(engine): add deterministic extraction adapter"

git add services/engine/document_engine/mapper.py
git commit -m "feat(engine): map extracted evidence into canonical claims"

git add services/engine/document_engine/worker.py
git commit -m "feat(engine): consume Redis stream ingestion jobs"

git add services/engine/tests
git commit -m "test(engine): cover extraction mapping and worker failure modes"

git add .github/workflows/ci.yml
git commit -m "ci: add Node and Python quality pipeline"

git add README.md docs scripts setup_github.sh
git commit -m "docs: add document intelligence case study"

if ! gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" "--$VISIBILITY" --source=. --remote=origin
else
  git remote remove origin >/dev/null 2>&1 || true
  git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
fi

git branch -M main
git push -u origin main

gh repo edit "$OWNER/$REPO_NAME" \
  --description "Async document intelligence platform with Next.js, FastAPI, Redis Streams, PostgreSQL 3NF mapping, and CI-tested extraction workflows." \
  --homepage "https://github.com/$OWNER/$REPO_NAME#readme" \
  --add-topic document-ai \
  --add-topic ai-infrastructure \
  --add-topic nextjs \
  --add-topic fastapi \
  --add-topic redis-streams \
  --add-topic postgresql \
  --add-topic docker \
  --add-topic typescript \
  --add-topic python \
  --add-topic data-modeling

echo "Published $REPO_NAME to GitHub."
