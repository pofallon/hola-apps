#!/usr/bin/env bash
#
# Publish every app package under src/* to GHCR as loose-OCI artifacts (the
# thing Hola `oras pull`s). Runtime *images* are built/pushed from each app's
# own repo (e.g. get2know-cms's image comes from the `site` repo's
# deploy/Dockerfile) — this only ships the compose.yaml + manifest.json package.
#
# Prereqs: oras, node, and `docker login ghcr.io` (or `oras login ghcr.io`).
set -euo pipefail

REGISTRY="$(node -p "require('./catalog.config.json').registry")"
PREFIX="$(node -p "require('./catalog.config.json').packagePrefix")"

for dir in src/*/; do
  name="$(node -p "require('./${dir}src/manifest.json').name")"
  version="$(node -p "require('./${dir}src/manifest.json').version")"
  ref="${REGISTRY}/${PREFIX}${name}:${version}"
  echo "==> oras push ${ref}"
  # Push each file with its real media type. Hola reads the compose by its
  # application/yaml layer; without an explicit type oras defaults to
  # application/vnd.oci.image.layer.v1.tar and Hola reports "no compose file".
  ( cd "${dir}src" && oras push "${ref}" \
      --annotation "org.opencontainers.image.title=${name}" \
      --annotation "org.opencontainers.image.version=${version}" \
      compose.yaml:application/yaml manifest.json:application/json )
done

echo "==> Done. Regenerate the index with: node scripts/generate-catalog.mjs"
