#!/bin/sh
# ══════════════════════════════════════════════════════════════
# n9router Entrypoint Wrapper — VPS deployment helper
# All runtime patches have been moved to source code in the
# custom Docker image. This wrapper only handles VPS-specific
# setup (lsof, sudo, cert trust).
# ══════════════════════════════════════════════════════════════
set -e

echo "[n9router-wrapper] 🔧 VPS setup..."

# ── 1. Install lsof + sudo (cert trust + port detection) ──
if ! command -v lsof >/dev/null 2>&1 || lsof -v 2>&1 | grep -q busybox; then
  apk add --no-cache lsof sudo >/dev/null 2>&1 || true
  echo "  ✅ lsof + sudo installed"
else
  echo "  ⏭️  lsof already available"
fi

# ── 2. Passwordless sudo for bun user ──
grep -q "bun ALL" /etc/sudoers 2>/dev/null || echo "bun ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
echo "  ✅ passwordless sudo configured"

# ── 3. Ensure auth dir exists ──
mkdir -p /app/data/auth 2>/dev/null || true

echo "[n9router-wrapper] ✅ Pre-start complete. Launching server..."

# ── 4. Start the post-boot config daemon in background ──
/app/data/scripts/postboot.sh &

# ── 5. Run the ORIGINAL entrypoint ──
exec /entrypoint.sh node server.js
