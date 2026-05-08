#!/usr/bin/env bash
# Build and push the Docker image for the current package.json version.
# Usage: ./scripts/publish-docker.sh [--force] [--image owner/repo] [--platform linux/amd64,linux/arm64]

set -euo pipefail

FORCE=false
IMAGE="nightwalker8x/n9router"
PLATFORM="linux/amd64,linux/arm64"

usage() {
  cat <<'EOF'
Usage: ./scripts/publish-docker.sh [options]

Options:
  --force                 Rebuild and overwrite the remote version tag if it exists
  --image <name>          Image name to push (default: nightwalker8x/n9router)
  --platform <platform>   Docker platform for buildx (default: linux/amd64,linux/arm64)
  -h, --help              Show this help

The script pushes both:
  <image>:<package.json version>
  <image>:latest
EOF
}

die() {
  echo "[docker-publish] ERROR: $*" >&2
  exit 1
}

info() {
  echo "[docker-publish] $*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --image)
      IMAGE="${2:-}"
      [[ -n "$IMAGE" ]] || die "--image requires a value"
      shift 2
      ;;
    --platform)
      PLATFORM="${2:-}"
      [[ -n "$PLATFORM" ]] || die "--platform requires a value"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v node >/dev/null || die "node is not installed"
command -v docker >/dev/null || die "docker is not installed"
docker buildx version >/dev/null 2>&1 || die "docker buildx is not available"

VERSION="$(node -p "require('./package.json').version")"

VERSION_REF="${IMAGE}:${VERSION}"
LATEST_REF="${IMAGE}:latest"

info "Image    : $IMAGE"
info "Version  : $VERSION"
info "Platform : $PLATFORM"

if docker buildx imagetools inspect "$VERSION_REF" >/dev/null 2>&1; then
  if ! $FORCE; then
    die "$VERSION_REF already exists. Use --force to rebuild and push it again."
  fi
  info "$VERSION_REF exists; rebuilding because --force was provided."
else
  info "$VERSION_REF does not exist remotely; building a new image."
fi

info "Building and pushing $VERSION_REF and $LATEST_REF..."
docker buildx build \
  --platform "$PLATFORM" \
  --tag "$VERSION_REF" \
  --tag "$LATEST_REF" \
  --push \
  --provenance=false \
  --sbom=false \
  "$ROOT"

info "Published $VERSION_REF and $LATEST_REF"
