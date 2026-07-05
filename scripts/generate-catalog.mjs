#!/usr/bin/env node
/**
 * Regenerate catalog.json from the per-app packages under src/*.
 *
 * Mirrors the try-hola/apps convention: each app is src/<name>/{package.json,
 * src/{compose.yaml, manifest.json}}. The catalog is the index Hola fetches; it
 * points each app version at its loose-OCI *package* ref in GHCR.
 *
 * Runnable with `node` or `bun`. No external deps.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'catalog.config.json'), 'utf8'));
const srcDir = join(root, 'src');

/** Light YAML scan: service keys indented 2 spaces under a top-level `services:`. */
function composeServices(yamlText) {
  const services = [];
  let inServices = false;
  for (const line of yamlText.split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (!inServices) continue;
    if (/^\S/.test(line)) break; // dedent → left the services block
    const m = line.match(/^ {2}([A-Za-z0-9._-]+):\s*$/);
    if (m) services.push(m[1]);
  }
  return services;
}

const apps = [];
const errors = [];

for (const name of readdirSync(srcDir).sort()) {
  const appDir = join(srcDir, name);
  const manifestPath = join(appDir, 'src', 'manifest.json');
  const composePath = join(appDir, 'src', 'compose.yaml');
  const pkgPath = join(appDir, 'package.json');

  if (!existsSync(manifestPath)) { errors.push(`${name}: missing src/manifest.json`); continue; }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  const version = manifest.version || pkg.version;

  if (!version) errors.push(`${name}: no version in manifest.json or package.json`);
  if (manifest.name !== name) errors.push(`${name}: manifest.name "${manifest.name}" must equal directory "${name}"`);
  if (!manifest.ingress?.service) errors.push(`${name}: manifest.ingress.service is required`);

  if (existsSync(composePath) && manifest.ingress?.service) {
    const services = composeServices(readFileSync(composePath, 'utf8'));
    if (!services.includes(manifest.ingress.service)) {
      errors.push(`${name}: ingress.service "${manifest.ingress.service}" is not a service in compose.yaml [${services.join(', ')}]`);
    }
  }

  const oci = `${config.registry}/${config.packagePrefix}${manifest.name}:${version}`;
  const entry = {
    id: manifest.name,
    name: manifest.title || manifest.name,
    description: manifest.description || '',
    category: config.category || 'apps',
    tags: manifest.tags || [],
    // Server's RemoteCatalog reader (packages/server/src/services/core/catalog.ts)
    // reads `versions[].refs.oci` strictly and throws NO_OCI_REF otherwise —
    // which getDraftDefaults swallows into an empty composeOverride, surfacing at
    // deploy time as "Active release has no compose file". Match the try-hola/apps
    // shape, not a bare `image` field.
    versions: [{ version, refs: { oci } }],
  };
  if (manifest.icon) entry.icon = manifest.icon;
  apps.push(entry);
}

if (errors.length) {
  console.error('Catalog validation failed:\n - ' + errors.join('\n - '));
  process.exit(1);
}

writeFileSync(join(root, 'catalog.json'), JSON.stringify({ apps }, null, 2) + '\n');
console.log(`Wrote catalog.json with ${apps.length} app(s): ${apps.map((a) => a.id).join(', ') || '(none)'}`);
