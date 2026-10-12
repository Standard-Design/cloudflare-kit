# Packaging, releases, and verification

The package name is `@standard-design/cloudflare-kit`; the repository is
`Standard-Design/cloudflare-kit`. This source targets `0.1.0-alpha.2`.
Check [GitHub releases](https://github.com/Standard-Design/cloudflare-kit/releases)
for published tags and assets, and npm for registry availability; a source
version bump does not publish either. Runtime APIs are unchanged from the
historical `@standard/cloudflare-kit` alpha.0 and alpha.1 releases. A package-name
migration is required even though function signatures and behavior are unchanged.

## Alpha.2 release scope

Alpha.2 is the first intended release of `@standard-design/cloudflare-kit`.
It adopts the available npm organization, packages the corrected first-party
notice `Copyright (c) 2026 Standard Design LLC`, and retains complete EdgeKit and
Type-Fest MIT notices for the adapted code/declaration lineage. The remaining
first-party MIT text, runtime behavior, exported signatures, and dependencies
are unchanged. Publication is configured for public access with the `alpha` tag,
using only the compiled `dist` package. No npm publication is implied by this work.

Neither the released alpha.0 nor alpha.1 artifact contains this correction.
Consumers on either version need the new alpha.2 artifact to receive it;
editing the source license does not update installed copies. Preserve both
older tags and assets rather than overwriting their names, licenses, or tarballs.
The new artifact filename is `standard-design-cloudflare-kit-0.1.0-alpha.2.tgz`.

## Scope migration

Replace `@standard/cloudflare-kit` with `@standard-design/cloudflare-kit` in the
consumer manifest, every source/type import, subpath import, and `declare module`
augmentation. Regenerate the lockfile after installing the reviewed new version.
Update mocks, TypeScript path mappings, dependency overrides, and any app-owned
bundler configuration that names the old package. Do not alter third-party
package names such as `@standard-schema/spec`.

All export subpaths remain the same. No compatibility alias or forwarding
package is published under the old scope. Avoid duplicate old/new copies: each
copy has its own AsyncLocalStorage store and module augmentation target. Update
the request entrypoint and all global accessor imports together. The repository
URL remains `Standard-Design/cloudflare-kit`.

Standard Stack's existing alpha.0 pin and other working consumers must remain
on their reviewed artifact until the renamed release is actually available.

## Alpha.1 release scope

The historical `@standard/cloudflare-kit@0.1.0-alpha.1` GitHub release introduced
the documentation and release-tooling work since alpha.0:

- A documentation index and nine subsystem guides covering context, dependency
  injection, bindings, KV, data and response caching, React Router, troubleshooting,
  and releases.
- Expanded public API comments preserved in declarations for editor hover help.
- Guide inclusion and packed-consumer checks for file contents, Markdown links,
  declaration comments, and typed examples.
- Repository URLs updated to `Standard-Design/cloudflare-kit`, README navigation,
  and the explicit npm `alpha` tag required by the publish dry run.

No runtime behavior, exported signatures, or runtime dependencies changed in alpha.1.
The original `v0.1.0-alpha.0` tag and assets must remain unchanged. Installing
that older artifact will not install these guides or expanded declaration comments.

## Install a reviewed artifact

For a reviewed public npm release, install the exact version after publication:

```sh
pnpm add @standard-design/cloudflare-kit@0.1.0-alpha.2
```

Npm package visibility is separate from the source repository's visibility.
The earlier alpha.0 and alpha.1 releases were GitHub-only, not npm publications.
For a GitHub artifact from the private repository, use authenticated GitHub access,
verify its checksum, then install a local file. Do not put credentials in a
dependency URL or assume private release URLs allow anonymous package fetches.
The commands below target alpha.2 and require its approved, published tag and
assets. Verify availability on GitHub before switching a consuming application.

```sh
gh release download v0.1.0-alpha.2 --repo Standard-Design/cloudflare-kit \
  --pattern 'standard-design-cloudflare-kit-0.1.0-alpha.2.tgz*'
shasum -a 256 -c standard-design-cloudflare-kit-0.1.0-alpha.2.tgz.sha256
pnpm add ./standard-design-cloudflare-kit-0.1.0-alpha.2.tgz
```

The historical package name is `@standard/cloudflare-kit` for both old assets.
The original `standard-cloudflare-kit-0.1.0-alpha.0.tgz` SHA-256 is
`edef3f5bfe5676fe4eddbf54869eacf37752da21edaed1cc30a82377c1a308f8`.
The `standard-cloudflare-kit-0.1.0-alpha.1.tgz` SHA-256 is
`3d3aba03f2403c2632ed5d64f2548aa7c42f646dde271cb446c8b6ae655bf832`.
Neither is the alpha.2 checksum. Calculate the new checksum from the approved
release build and attach its `.sha256` file alongside the new tarball; do not
reuse the old checksum or a verification-only build as release evidence.
Keep the artifact accessible to teammates/CI and commit the consumer lockfile.
The tarball has compiled code and no installation scripts.

An exact Git dependency remains supported by CFKit's repository `prepare`
script, unlike some other Standard packages:

```sh
pnpm add github:Standard-Design/cloudflare-kit#v0.1.0-alpha.2
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
README/LICENSE/THIRD_PARTY_NOTICES.md and the Markdown guides into `dist`, and strips development
dependencies, scripts, the repository file list, and package-manager metadata.

Public `/** ... */` comments remain in `.d.ts` output for editor hover help.
JavaScript and declaration source maps are disabled. No TypeScript implementation,
test files, build configs, or repository scripts belong in the distribution.
JavaScript and declarations are readable code by design; compiled-only means
the original TypeScript implementation and source maps are excluded.

`pnpm release:pack` builds and runs `npm pack ./dist`. `pnpm release:publish`
builds and runs `npm publish ./dist --access public --tag alpha`; it performs a
real public npm publication and requires separate authorization. `publishConfig`
is retained in the distribution manifest with `access: public`, `tag: alpha`, and
`registry: https://registry.npmjs.org/`. Ordinary root
publication is blocked by `prepublishOnly`; root packing is not blocked, so
always use the explicit dist command for handoff artifacts. Do not bypass the
publication guard with `--ignore-scripts`.

## Npm publication readiness

Before an explicitly approved publication:

- Authenticate with the intended npm account and verify it has publishing
  permission in `standard-design`; satisfy the account's applicable 2FA or
  approved token/trusted-publisher requirements. Never commit credentials.
- Check that the exact new package/version can be published. An unauthenticated
  404 is not proof of organization membership or permission.
- Confirm the reviewed commit is clean, full verification and CI pass, and the
  packed manifest contains the new name, expected version, and public/alpha
  configuration. Review all files that will become publicly downloadable even
  if the source repository remains private.
- Publish only `dist`, never the repository root. CI currently verifies only;
  no automated publishing or trusted-publisher setup is supplied here.
- After publication, verify registry metadata, public access, `alpha` tag,
  downloaded bytes, notices, and an exact-version consumer install before
  changing integration pins. Preserve all prior tags and release assets.

See npm's [publish configuration](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#publishconfig)
and [publish command](https://docs.npmjs.com/cli/v11/commands/npm-publish).
A dry run checks packaging; it does not authenticate or prove publish rights.

## What verification proves

Use Node 24+ and the manifest-pinned pnpm version (currently 11.26.0):

```sh
pnpm install --frozen-lockfile
pnpm verify
```

CI runs these commands on pushes and pull requests. `verify` includes Wrangler
type generation, formatting/lint, strict source and consumer typechecks,
Workers-runtime tests, build, a publish dry run with explicit `--access public --tag alpha`,
publint, Are the Types Wrong, and an installed-tarball smoke check. The explicit
tag is required by newer npm versions for prerelease publication, including dry
runs; do not rely on an older local npm accepting the default `latest` tag.

The package test checks the new identity and filename, public/alpha configuration,
exact expected file paths, full guide/license/notice content, declaration comments,
public imports, module augmentation, and standalone guide examples against
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
6. If npm publication is also explicitly approved, complete the readiness checks
   above and use `pnpm release:publish`. Verify the registry artifact separately;
   creating a GitHub release does not publish to npm.

The current scripts do not enforce a clean checkout, create checksums, tag,
push, or create GitHub releases automatically. Those steps remain maintainer
responsibility. A successful dry run does not grant publication authority or
confirm registry access. Packaging changes here do not replace the original
alpha.0 or alpha.1 assets, and a newly built working-tree tarball is not either
of those released files.

## Application acceptance and ownership

Generate the app's own binding types and check its compatibility flags. Confirm
both global access and explicit injection work inside its request entrypoint.
Check public/private/preview cache separation, data versus HTML responses, cookie
headers, parser failures, key variations, invalidation, and environment-specific
resource IDs. Keep secrets out of browser bundles and serialized loader results.

First-party MIT licensing is in LICENSE; retained upstream notices and the
focused attribution audit are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
The repository README and release notes carry
migration guidance; CFKit currently has no standalone changelog. This guide
does not adopt another package's license or release tooling conventions.

## Source and related guides

Build: `tsconfig.build.json`, `scripts/clean-dist.mjs`,
`scripts/assemble-package.mjs`; verification: `scripts/test-packed-package.mjs`,
`package.json`, `.github/workflows/ci.yml`; entrypoints: `src/index.ts` and
`src/http-cache/index.ts`. Return to the [index](README.md) or the
[package overview](../README.md).
