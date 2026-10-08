# Packaging, releases, and verification

The package name is `@standard/cloudflare-kit`; the repository is
`Standard-Design/cloudflare-kit`. Runtime APIs described here match alpha.0.
Expanded guides and API comments are later documentation work: installing the
existing `v0.1.0-alpha.0` asset will not install these new files. No tag, version,
or release asset is changed by editing these guides.

## Install a reviewed artifact

The initial distribution is a GitHub prerelease, not an npm registry release.
For a private repository, download the asset through authenticated GitHub access,
verify its checksum, then install a local file. Do not put credentials in a
dependency URL or assume private release URLs allow anonymous package fetches.

```sh
gh release download v0.1.0-alpha.0 --repo Standard-Design/cloudflare-kit \
  --pattern 'standard-cloudflare-kit-0.1.0-alpha.0.tgz*'
shasum -a 256 -c standard-cloudflare-kit-0.1.0-alpha.0.tgz.sha256
pnpm add ./standard-cloudflare-kit-0.1.0-alpha.0.tgz
```

The original alpha.0 tarball SHA-256 is
`edef3f5bfe5676fe4eddbf54869eacf37752da21edaed1cc30a82377c1a308f8`.
Keep the artifact accessible to teammates/CI and commit the consumer lockfile.
The tarball has compiled code and no installation scripts.

An exact Git dependency remains supported by CFKit's repository `prepare`
script, unlike some other Standard packages:

```sh
pnpm add github:Standard-Design/cloudflare-kit#v0.1.0-alpha.0
```

It requires repository access, development build tools, and possibly the
consumer's pnpm `allowBuilds` approval. Git installs build from the tagged
repository; they are not the same distribution layout as the compiled tarball.
Prefer the reviewed tarball for predictable installations. Never follow a
floating branch for a released integration.

## How the package is assembled

`pnpm build` runs three stages: remove generated `dist`, compile TypeScript to
JavaScript/declarations, then assemble the distribution manifest and docs.
`scripts/assemble-package.mjs` rewrites `./dist/` entry targets to `./`, copies
README/LICENSE and the Markdown guides into `dist`, and strips development
dependencies, scripts, the repository file list, and package-manager metadata.

Public `/** ... */` comments remain in `.d.ts` output for editor hover help.
JavaScript and declaration source maps are disabled. No TypeScript implementation,
test files, build configs, or repository scripts belong in the distribution.
JavaScript and declarations are readable code by design; compiled-only means
the original TypeScript implementation and source maps are excluded.

`pnpm release:pack` builds and runs `npm pack ./dist`. `pnpm release:publish`
builds and runs `npm publish ./dist --tag alpha`; it would perform a real npm
publication and is not part of the initial GitHub-only workflow. Ordinary root
publication is blocked by `prepublishOnly`; root packing is not blocked, so
always use the explicit dist command for handoff artifacts. Do not bypass the
publication guard with `--ignore-scripts`.

## What verification proves

Use Node 24+ and the manifest-pinned pnpm version (currently 11.26.0):

```sh
pnpm install --frozen-lockfile
pnpm verify
```

CI runs these commands on pushes and pull requests. `verify` includes Wrangler
type generation, formatting/lint, strict source and consumer typechecks,
Workers-runtime tests, build, a publish dry run with explicit `--tag alpha`,
publint, Are the Types Wrong, and an installed-tarball smoke check. The explicit
tag is required by newer npm versions for prerelease publication, including dry
runs; do not rely on an older local npm accepting the default `latest` tag.

The package test checks exact expected file paths, guide/license content,
declaration comments, public imports, and standalone guide examples against
the installed tarball. It compiles React Router guide examples using the
repository's installed React Router types. Its router declaration check uses
`skipLibCheck: true`, like the existing consumer fixture; other guide examples
check declarations without that exception. Optional Zod and virtual-server-build
snippets marked `ts illustrative` are not compiled. Examples are typechecked,
not all executed with production resources. Markdown relative links are checked
against the files that will ship.

The ESM-only package supports Node-style ESM and bundler resolution; CommonJS
`require` and legacy Node 10 resolution are outside the ATTW profile. Workers
tests run locally, not in multiple Cloudflare data centers. They cannot verify
production expiry/eviction, cross-region invalidation, app-specific authentication,
preview security, or a full React Router build. Test those in the consuming app.

## Reviewed release sequence

1. Review logical diffs and full commit messages before creating commits. Keep
   source projects and other packages read-only unless separately authorized.
2. After approval, integrate the reviewed commits into the intended release
   branch and run verification on that exact revision.
3. Choose a new version when a new artifact is needed, through a separate
   reviewed release change. Preserve previously distributed tags and assets.
4. With explicit release approval, create an annotated tag on the reviewed
   release commit, build and pack `./dist`, inspect its file list, and calculate
   SHA-256. Record the exact commit, version, tool versions, and checksum.
5. Attach the tarball and checksum to the approved GitHub prerelease. Verify the
   uploaded/downloaded bytes and provide an exact install spec to consumers.

The current scripts do not enforce a clean checkout, create checksums, tag,
push, or create GitHub releases automatically. Those steps remain maintainer
responsibility. A successful dry run does not grant publication authority or
confirm registry access. Packaging changes here do not replace the original
alpha.0 asset, and a newly built working-tree tarball is not that released file.

## Application acceptance and ownership

Generate the app's own binding types and check its compatibility flags. Confirm
both global access and explicit injection work inside its request entrypoint.
Check public/private/preview cache separation, data versus HTML responses, cookie
headers, parser failures, key variations, invalidation, and environment-specific
resource IDs. Keep secrets out of browser bundles and serialized loader results.

MIT licensing is in LICENSE. The repository README and release notes carry
migration guidance; CFKit currently has no standalone changelog. This guide
does not adopt another package's license or release tooling conventions.

## Source and related guides

Build: `tsconfig.build.json`, `scripts/clean-dist.mjs`,
`scripts/assemble-package.mjs`; verification: `scripts/test-packed-package.mjs`,
`package.json`, `.github/workflows/ci.yml`; entrypoints: `src/index.ts` and
`src/http-cache/index.ts`. Return to the [index](README.md) or the
[package overview](../README.md).
