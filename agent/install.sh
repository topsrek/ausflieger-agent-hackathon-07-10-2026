#!/bin/sh
# Install the Ausflieger research agent onto an OpenClaw instance (Agent 37, agent37-openclaw template).
# Run on the instance from a checkout of this repo:   sh agent/install.sh
# Idempotent. Does not touch secrets: put SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY into
# agent/tools/.env yourself (or the skill env in openclaw.json).
set -eu

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORKSPACE=${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}

echo "workspace: $WORKSPACE"
mkdir -p "$WORKSPACE/skills"

# 1. Workspace files. Existing AGENTS.md/HEARTBEAT.md are backed up once.
for f in AGENTS.md HEARTBEAT.md; do
  if [ -f "$WORKSPACE/$f" ] && [ ! -f "$WORKSPACE/$f.pre-ausflieger" ] && ! grep -q "Ausflieger" "$WORKSPACE/$f"; then
    cp "$WORKSPACE/$f" "$WORKSPACE/$f.pre-ausflieger"
  fi
  cp "$REPO_DIR/agent/workspace/$f" "$WORKSPACE/$f"
done
rm -rf "$WORKSPACE/skills/ausflieger-research"
cp -R "$REPO_DIR/agent/workspace/skills/ausflieger-research" "$WORKSPACE/skills/"

# 2. CLI: install deps and put `ausflieger` on PATH.
cd "$REPO_DIR/agent/tools"
npm install --omit=dev --no-audit --no-fund
chmod +x bin/ausflieger.mjs
if npm install -g . >/dev/null 2>&1; then
  echo "installed ausflieger globally: $(command -v ausflieger || echo 'not on PATH?')"
else
  mkdir -p "$HOME/.local/bin"
  ln -sf "$REPO_DIR/agent/tools/bin/ausflieger.mjs" "$HOME/.local/bin/ausflieger"
  echo "linked $HOME/.local/bin/ausflieger (make sure it is on PATH for the gateway)"
fi

# 3. Env check (no values printed).
if [ ! -f "$REPO_DIR/agent/tools/.env" ] && [ -z "${SUPABASE_URL:-}" ]; then
  echo "NOTE: create $REPO_DIR/agent/tools/.env with SUPABASE_URL=... and SUPABASE_SERVICE_ROLE_KEY=..."
fi
ausflieger travel estimate 48.13743 11.57549 48.12990 11.58340 >/dev/null && echo "ausflieger CLI ok"
echo "done. Restart the OpenClaw gateway or start a new session so AGENTS.md and the skill are reloaded."
