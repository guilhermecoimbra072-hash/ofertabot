#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
node --version
npm ci
npm run build
npm run setup
printf '%s\n' 'Abra .env, configure a credencial e execute npm run engine. Consulte PRIMEIRO-TESTE.md.'
