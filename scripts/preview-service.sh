#!/usr/bin/env bash
# The login-independent entry point for website-preview-4173.service.
# Resolve the installed NVM default afresh; do not pin a removable Node version,
# source interactive shell startup, install dependencies, or build during login.
set -e

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--check" ) ]]; then
  printf 'Usage: %s [--check]\n' "$0" >&2
  exit 2
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ -r "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # NVM is a shell function, not an executable available in systemd's PATH.
  . "$NVM_DIR/nvm.sh" --no-use
  if ! nvm use --silent default >/dev/null; then
    printf 'Preview: install/select a Node version for the NVM default alias.\n' >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null; then
  printf 'Preview: Node is unavailable; install/select the project runtime.\n' >&2
  exit 1
fi
# Match package.json's >=22.12.0 runtime requirement without loading dependencies.
node -e 'const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.error("Preview requires Node >=22.12.0; found " + process.version);
    process.exit(1);
  }'

for required in node_modules/vite/bin/vite.js dist/index.html; do
  if [[ ! -r "$required" ]]; then
    printf 'Preview: missing %s. Run npm ci and npm run build in %s.\n' "$required" "$PWD" >&2
    exit 1
  fi
done

if [[ "${1:-}" == "--check" ]]; then
  printf 'Preview prerequisites ready: %s (%s); %s\n' "$(command -v node)" "$(node --version)" "$PWD"
  exit 0
fi

# Make the serving process systemd's MainPID, not an intermediate npm/shell job.
exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort
