# hola-apps — first-party Hola catalog

A private, self-hosted [Hola](https://github.com/try-hola/hola) app catalog for
apps you don't want in the public `try-hola/apps` catalog. It mirrors the public
catalog's conventions exactly, so anything here installs through Hola's normal
browse → wizard → deploy flow — it's just served from *your* namespace.

> Requires the **multi-catalog** capability in Hola (custom catalog sources +
> private-registry auth). See the companion design prompt in the `site` repo.

## Layout

```
hola-apps/
├── catalog.config.json          # registry + package-name prefix used to build image refs
├── catalog.json                 # GENERATED index Hola fetches (do not hand-edit)
├── scripts/
│   ├── generate-catalog.mjs      # rebuilds catalog.json from src/* (node or bun)
│   └── publish-packages.sh       # oras-push each app package to GHCR
├── .github/workflows/catalog.yml # regenerate catalog.json on merge; verify on PRs
└── src/
    └── get2know-cms/             # one dir per app (== manifest.name == catalog id)
        ├── package.json          # OCI annotations
        └── src/
            ├── compose.yaml      # prebuilt, digest-pinned; ${HOLA_APP_DATA} vols; no host ports
            └── manifest.json     # ingress + defaultEnv secrets
```

## Two artifacts per app (don't conflate them)

- **Runtime image** — the actual container the compose runs
  (`ghcr.io/pofallon/hola-get2know-cms-web`). Built from the *app's own repo*
  (get2know-cms: the `site` repo's `deploy/Dockerfile`) and pinned by digest in
  `compose.yaml`.
- **App package** — the `compose.yaml` + `manifest.json`, pushed as a loose-OCI
  artifact (`ghcr.io/pofallon/hola-get2know-cms`). This is what Hola pulls;
  `catalog.json` points at it. Published from here via `scripts/publish-packages.sh`.

`catalog.config.json` maps a package name to its ref:
`${registry}/${packagePrefix}<manifest.name>:<version>`.

## Add / update an app

1. Add `src/<name>/{package.json, src/{compose.yaml, manifest.json}}` (copy an
   existing one). `manifest.name` **must** equal `<name>`, and `ingress.service`
   **must** name a service in `compose.yaml` — the generator enforces both.
2. Build & push the app's runtime image from its own repo; pin the digest into
   `compose.yaml`.
3. `node scripts/generate-catalog.mjs` → regenerates `catalog.json`.
4. `OWNER=pofallon ./scripts/publish-packages.sh` → pushes the package(s).
5. Commit. CI re-verifies `catalog.json` on the PR and refreshes it on merge.

## Point Hola at this catalog

Add a custom source in Hola:

```
url:   https://raw.githubusercontent.com/pofallon/hola-apps/main/catalog.json
auth:  ghcr.io  (a GHCR PAT with read:packages — the packages/images are private)
trust: custom
```

Hola merges these apps alongside the public catalog (namespaced by source), and
installs run through the same env-secret wizard + Traefik ingress.

## Source-of-truth note (get2know-cms)

The `get2know-cms` package here was seeded from the `site` repo's `deploy/hola/`
scaffold. **Pick one home to avoid drift** — recommended: treat *this* repo as
canonical for the package (compose + manifest), and reduce `site/deploy/hola/` to
just the image build/publish helper (its `publish.sh` builds the runtime image
from `deploy/Dockerfile`). The `site` repo owns the image; this repo owns the
package + the catalog index.
