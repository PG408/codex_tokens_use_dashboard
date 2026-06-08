#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Codex Token Monitor"
EXECUTABLE_NAME="CodexTokenMonitor"
APP_DIR="${ROOT_DIR}/dist-macos/${APP_NAME}.app"
CONTENTS_DIR="${APP_DIR}/Contents"
SERVER_RESOURCES_DIR="${CONTENTS_DIR}/Resources/server"

cd "${ROOT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to build the dashboard assets."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm install
fi

npm run build
swift build -c release

rm -rf "${APP_DIR}"
mkdir -p "${CONTENTS_DIR}/MacOS" "${SERVER_RESOURCES_DIR}"

cp ".build/release/${EXECUTABLE_NAME}" "${CONTENTS_DIR}/MacOS/${EXECUTABLE_NAME}"
cp "Assets/AppIcon.icns" "${CONTENTS_DIR}/Resources/AppIcon.icns"
cp -R dist dist-server package.json package-lock.json "${SERVER_RESOURCES_DIR}/"

pushd "${SERVER_RESOURCES_DIR}" >/dev/null
npm install --omit=dev --ignore-scripts
popd >/dev/null

cat > "${CONTENTS_DIR}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${EXECUTABLE_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>local.codex-token-monitor</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "Built ${APP_DIR}"
