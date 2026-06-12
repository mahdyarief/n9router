#!/bin/sh
# ══════════════════════════════════════════════════════════════
# n9router Post-Boot Script
# Runs in background after container start.
# Waits for Next.js, then enables MITM + DNS + Token Swap + RTK.
# ══════════════════════════════════════════════════════════════

echo "[n9router-postboot] ⏳ Waiting for Next.js to be ready..."
for i in $(seq 1 30); do
  if wget -qO- http://127.0.0.1:20128/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! wget -qO- http://127.0.0.1:20128/api/health >/dev/null 2>&1; then
  echo "[n9router-postboot] ❌ Next.js never became ready, skipping post-boot"
  exit 0
fi

echo "[n9router-postboot] 🚀 Next.js ready, configuring Token Rotate..."

# ── Compute CLI token ──
CLI_TOKEN=$(node -e "
const crypto = require('crypto');
const fs = require('fs');
let mid = '';
try { mid = fs.readFileSync('/app/data/machine-id', 'utf8').trim(); } catch {}
let sec = '';
try { sec = fs.readFileSync('/app/data/auth/cli-secret', 'utf8').trim(); } catch { sec = crypto.randomBytes(32).toString('hex'); }
console.log(crypto.createHash('sha256').update(mid + '9r-cli-auth' + sec).digest('hex').substring(0, 16));
")
export CLI_TOKEN

# ── Get existing API key or create one ──
API_KEY=$(wget -qO- --header="x-9r-cli-token: $CLI_TOKEN" \
  http://127.0.0.1:20128/api/keys 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const k=(d.keys||[])[0]; process.stdout.write(k?.key||'')" 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
  echo "[n9router-postboot] Creating API key..."
  API_KEY=$(wget -qO- --post-data='{"name":"mitm-key"}' \
    --header='Content-Type: application/json' \
    --header="x-9r-cli-token: $CLI_TOKEN" \
    http://127.0.0.1:20128/api/keys 2>/dev/null | \
    node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).key||'')" 2>/dev/null || echo "")
fi
export API_KEY
echo "[n9router-postboot] API Key: ${API_KEY:0:12}..."

# ── Check MITM status ──
MITM_STATUS=$(wget -qO- --header="x-9r-cli-token: $CLI_TOKEN" \
  http://127.0.0.1:20128/api/cli-tools/antigravity-mitm 2>/dev/null || echo "{}")
MITM_RUNNING=$(echo "$MITM_STATUS" | \
  node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).running||false))" 2>/dev/null || echo "false")

if [ "$MITM_RUNNING" != "true" ] && [ -n "$API_KEY" ]; then
  echo "[n9router-postboot] Starting MITM server..."
  wget -qO- --post-data="{\"apiKey\":\"$API_KEY\",\"sudoPassword\":\"x\"}" \
    --header='Content-Type: application/json' \
    --header="x-9r-cli-token: $CLI_TOKEN" \
    http://127.0.0.1:20128/api/cli-tools/antigravity-mitm >/dev/null 2>&1
  sleep 3
  echo "[n9router-postboot] ✅ MITM server started"
else
  echo "[n9router-postboot] ⏭️  MITM already running (or no API key)"
fi

# ── Enable DNS redirect for Antigravity ──
echo "[n9router-postboot] Enabling DNS redirect for Antigravity..."
wget -qO- --method=PATCH \
  --body-data='{"tool":"antigravity","action":"enable","sudoPassword":"x"}' \
  --header='Content-Type: application/json' \
  --header="x-9r-cli-token: $CLI_TOKEN" \
  http://127.0.0.1:20128/api/cli-tools/antigravity-mitm >/dev/null 2>&1

# Also write DNS entries directly to /etc/hosts (host vis --network host)
# The container /etc/hosts is managed by Docker and gets reset on recreation.
for host in daily-cloudcode-pa.googleapis.com cloudcode-pa.googleapis.com; do
  grep -q "$host" /etc/hosts 2>/dev/null || echo "127.0.0.1 $host" >> /etc/hosts
done
echo "[n9router-postboot] ✅ DNS redirect enabled"

# ── Enable Token Swap Pool + RTK (idempotent) ──
echo "[n9router-postboot] Enabling Token Swap Pool + RTK..."
wget -qO- --method=PATCH \
  --body-data='{"tokenSwapEnabled":true,"tokenSwapStrategy":"round-robin","rtkEnabled":true}' \
  --header='Content-Type: application/json' \
  --header="x-9r-cli-token: $CLI_TOKEN" \
  http://127.0.0.1:20128/api/settings >/dev/null 2>&1
echo "[n9router-postboot] ✅ Token Swap Pool (round-robin) + RTK enabled"

echo "[n9router-postboot] 🎉 All done! n9router Token Rotate is READY."
