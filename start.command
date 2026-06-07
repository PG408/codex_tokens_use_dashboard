#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install the latest LTS version from https://nodejs.org/"
  read -r "?Press Return to close this window."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -f "dist/index.html" ] || [ ! -f "dist-server/server/index.js" ]; then
  echo "Building Codex Token Monitor..."
  npm run build
fi

HOST="${CODEX_TOKEN_DASHBOARD_HOST:-127.0.0.1}"
PORT="${CODEX_TOKEN_DASHBOARD_PORT:-4317}"
URL="http://${HOST}:${PORT}"

echo "Starting Codex Token Monitor at ${URL}"
echo "Close this terminal window or press Control-C to stop the app."

(sleep 1 && open "${URL}") &
npm start
