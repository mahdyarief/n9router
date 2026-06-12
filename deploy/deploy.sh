#!/bin/bash
# ══════════════════════════════════════════════════════════════
# n9router — One-Shot Deploy Script
# Run on a fresh VPS:  bash deploy.sh
# ══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/opt/apps/n9router"
IMAGE="nightwalker8x/n9router:custom"

echo "═══════════════════════════════════════════════════════════"
echo "  n9router — Deploy"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Check prerequisites ──
echo ""
echo "🔍 Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Install it first: curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo "  ✅ Docker: $(docker --version)"

# ── 2. Environment file ──
echo ""
if [ ! -f "$INSTALL_DIR/.env" ]; then
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    echo "📝 Created .env from example. Edit $INSTALL_DIR/.env then re-run."
    exit 1
  else
    echo "⚠️  No .env file. Create $INSTALL_DIR/.env with INITIAL_PASSWORD etc."
    exit 1
  fi
fi
source "$INSTALL_DIR/.env"
echo "  ✅ .env loaded (password: ${INITIAL_PASSWORD:0:3}***)"

# ── 3. Create directory structure ──
echo ""
echo "📁 Setting up directories..."
mkdir -p "$INSTALL_DIR/data/scripts"
mkdir -p "$INSTALL_DIR/data/auth"
mkdir -p "$INSTALL_DIR/data/db"
mkdir -p "$INSTALL_DIR/data/mitm"
echo "  ✅ $INSTALL_DIR ready"

# ── 4. Copy deployment scripts ──
echo ""
echo "📋 Copying scripts..."
cp "$SCRIPT_DIR/entrypoint-wrapper.sh" "$INSTALL_DIR/entrypoint-wrapper.sh"
cp "$SCRIPT_DIR/postboot.sh" "$INSTALL_DIR/data/scripts/postboot.sh"
chmod +x "$INSTALL_DIR/entrypoint-wrapper.sh"
chmod +x "$INSTALL_DIR/data/scripts/postboot.sh"
echo "  ✅ All scripts copied"

# ── 5. Write DNS entries to host /etc/hosts ──
echo ""
echo "🌐 Writing Antigravity DNS redirect entries to /etc/hosts..."
for host in daily-cloudcode-pa.googleapis.com cloudcode-pa.googleapis.com; do
  if ! grep -q "$host" /etc/hosts 2>/dev/null; then
    echo "127.0.0.1 $host" >> /etc/hosts
    echo "  ✅ Added $host → 127.0.0.1"
  else
    echo "  ⏭️  $host already in /etc/hosts"
  fi
done

# ── 6. Build or pull Docker image ──
echo ""
if [ -f "$INSTALL_DIR/Dockerfile" ]; then
  echo "🔨 Building custom Docker image from source..."
  docker build -t "$IMAGE" "$INSTALL_DIR" 2>&1 | tail -5
  echo "  ✅ Image built"
else
  echo "📦 Pulling Docker image: $IMAGE"
  docker pull "$IMAGE"
  echo "  ✅ Image pulled"
fi

# ── 7. Stop existing container (if any) ──
if docker ps -a --format "{{.Names}}" | grep -q "^n9router$"; then
  echo ""
  echo "🔄 Stopping existing n9router container..."
  docker stop n9router 2>/dev/null || true
  docker rm n9router 2>/dev/null || true
  echo "  ✅ Old container removed"
fi

# ── 8. Start container ──
echo ""
echo "🚀 Starting n9router container..."
docker run -d \
  --name n9router \
  --restart unless-stopped \
  --network host \
  --cap-add=NET_ADMIN \
  --cap-add=NET_BIND_SERVICE \
  -v "$INSTALL_DIR/data:/app/data" \
  -v "$INSTALL_DIR/entrypoint-wrapper.sh:/entrypoint-wrapper.sh:ro" \
  --env-file "$INSTALL_DIR/.env" \
  --entrypoint /entrypoint-wrapper.sh \
  "$IMAGE"

echo "  ✅ Container started"

# ── 9. Wait for auto-configuration ──
echo ""
echo "⏳ Waiting for auto-configuration (MITM + DNS + Token Swap)..."
for i in $(seq 1 30); do
  if docker logs n9router 2>&1 | grep -q "All done"; then
    echo "  ✅ Auto-configuration complete!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ⚠️  Timeout. Check: docker logs n9router"
    break
  fi
  sleep 2
done

# ── 10. Show status ──
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🎉 n9router is RUNNING!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard:  http://$(hostname -I | awk "{print \$1}"):20128"
echo "  Password:    $INITIAL_PASSWORD"
echo ""
echo "  Next steps:"
echo "  1. Open the dashboard and login"
echo "  2. Go to Providers → Antigravity → Connect"
echo "  3. Add 2+ Antigravity accounts for token rotation"
echo ""
echo "  Useful commands:"
echo "    docker logs -f n9router          # View logs"
echo "    docker restart n9router          # Restart"
echo "    docker exec -it n9router sh      # Shell into container"
echo ""
