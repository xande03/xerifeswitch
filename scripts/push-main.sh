#!/usr/bin/env bash
# Commit + push automático para a main.
# Uso:
#   scripts/push-main.sh "mensagem de commit"
#   scripts/push-main.sh          # mensagem automática com data/hora
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

git add -A

if git diff --cached --quiet; then
  echo "✔ Nada para commitar (working tree limpo)."
  exit 0
fi

MSG="${*:-chore: atualizacao automatica $(date '+%Y-%m-%d %H:%M')}"

git commit -m "$MSG"
git push origin main

echo "✔ Commit enviado para origin/main: $MSG"
