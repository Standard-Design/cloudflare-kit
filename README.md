# `@standard-design/cloudflare-kit`

Typed, framework-independent utilities for Cloudflare Workers bindings, Workers
KV, request-local context, KV-backed data caching, and the Cache API.

Cloudflare Kit began as a Sawkill utility inspired by
[EdgeKit](https://github.com/edgefirst-dev/kit). This package preserves its main
ergonomic goal—importing request-scoped capabilities wherever server code needs
them—while adding explicit factories, inferred binding types, conservative HTTP
cache policy, and Workers-runtime tests.

For the full explanation, start with the [documentation index](docs/README.md).
It includes a recommended reading order, shared terminology, subsystem guides,
and application ownership and verification boundaries. The expanded guides
and API comments are included starting with alpha.1; the original alpha.0 release
remains unchanged.

## Table of contents

- [Status and installation](#status-and-installation)
  - [Migrating from the old scope](#migrating-from-the-old-scope)
- [Requirements](#requirements)
- [Request context](#request-context)
  - [Type global accessors once](#type-global-accessors-once)
  - [Explicit construction and dependency injection](#explicit-construction-and-dependency-injection)
- [React Router 8](#react-router-8)
- [Workers KV](#workers-kv)
  - [General KV access](#general-kv-access)
  - [KV-backed data cache](#kv-backed-data-cache)
  - [Runtime parsing and Zod](#runtime-parsing-and-zod)
- [HTTP response caching](#http-response-caching)
  - [Cache complete React Router HTML](#cache-complete-react-router-html)
  - [Authenticated and private routes](#authenticated-and-private-routes)
  - [Cache keys, variation, and invalidation](#cache-keys-variation-and-invalidation)
- [Package entry points](#package-entry-points)
- [Sawkill migration](#sawkill-migration)
- [Development and verification](#development-and-verification)
- [License](#license)

## Status and installation

This source targets `@standard-design/cloudflare-kit@0.1.0-alpha.2`, the first
prerelease under the `standard-design` npm organization. It includes the corrected
Standard Design LLC copyright holder and third-party notices. Runtime APIs are
unchanged; imports must use the new scope.

Public npm publication is prepared, not automatic. After the reviewed version
has been published to npm, install it with:

```sh
pnpm add @standard-design/cloudflare-kit@0.1.0-alpha.2
```

Check npm or [GitHub releases](https://github.com/Standard-Design/cloudflare-kit/releases)
for availability before installing. A source version bump or successful dry run
does not publish a release. Historical alpha.0 and alpha.1 GitHub artifacts use
`@standard/cloudflare-kit` and retain their original names, notices, and checksums.

Use an exact packed artifact or Git tag while the package is being integrated
into Standard Stack. Do not use a floating branch as a dependency.

The packed tarball is the simplest initial integration artifact because it
contains compiled output and does not run dependency build scripts:

```sh
pnpm add ./standard-design-cloudflare-kit-0.1.0-alpha.2.tgz
```

For this private repository, download release assets through authenticated
GitHub access first. See [installation and checksum verification](docs/prerelease.md#install-a-reviewed-artifact).

An exact Git tag also works because the package builds during Git dependency
preparation:

```sh
pnpm add github:Standard-Design/cloudflare-kit#v0.1.0-alpha.2
```

pnpm may require the consuming project to allow that Git dependency's build in
`pnpm-workspace.yaml`. Follow the exact `allowBuilds` entry printed by pnpm, or
use npm or the packed tarball to avoid dependency build scripts. See pnpm's
[`allowBuilds` setting](https://pnpm.io/settings#allowbuilds).

### Migrating from the old scope

Replace the old dependency with `@standard-design/cloudflare-kit`, update every
import (including subpaths) and `declare module` augmentation, and regenerate
the application's lockfile. The repository URL and export subpaths are unchanged.
There is no compatibility package or alias at `@standard/cloudflare-kit`.

Do not install both identities or mix their accessors: each installed copy owns
its own AsyncLocalStorage instance, so a scope entered through one package does
not activate the other. Keep existing working pins until the new release is
available. See [scope migration](docs/prerelease.md#scope-migration) for details.

## Requirements

- Cloudflare Workers modules syntax
- `AsyncLocalStorage` support through a current compatibility date,
  `nodejs_compat`, or `nodejs_als`
- Binding types generated from the consuming Worker's Wrangler configuration
- Node.js 24 and pnpm 11 for package development or Git dependency builds

Existing Workers can enable Node compatibility explicitly. Current compatibility
dates enable it automatically; see Cloudflare's
[AsyncLocalStorage documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/).

```jsonc
{
	"compatibility_date": "2026-09-18",
	"compatibility_flags": ["nodejs_compat"],
}
```

Cloudflare Kit has no runtime package dependencies. It uses structural
interfaces for Cloudflare resources, so the application's generated `Env`
remains the source of truth.

## Request context

Wrap each Worker execution in `runWithCloudflareKit()`. A private
`AsyncLocalStorage` keeps the context isolated across concurrent requests, so
deeper server code can import request-scoped capabilities without threading an
object through every function signature.

```ts
import {
	cache,
	env,
	runWithCloudflareKit,
} from '@standard-design/cloudflare-kit'

export default {
	fetch(request, workerEnv, ctx) {
		return runWithCloudflareKit({ ctx, env: workerEnv, request }, async () => {
			const token = env().require('API_TOKEN')
			const settings = await cache().getOrSet('settings', loadSettings)
			return Response.json({ settings, tokenPresent: token.length > 0 })
		})
	},
} satisfies ExportedHandler<Env>
```

Code called anywhere inside that callback can use:

- `getCloudflareKit()` for the complete context
- `bindings()` for the original Worker bindings
- `env()` for required and optional binding reads
- `kv()` for general Workers KV access
- `cache()` for a KV-backed application-data cache
- `request()` for the current request
- `waitUntil()` for background work

Access outside an active scope throws `CloudflareKitContextError` instead of
silently sharing state between requests.

### Type global accessors once

Merge the generated Worker `Env` into the package once:

```ts
import '@standard-design/cloudflare-kit'

declare module '@standard-design/cloudflare-kit' {
	interface CloudflareKitBindings extends Env {}
}
```

`cache()` and `kv()` use the conventional `KV` binding by default. Additional
namespaces are selected by generated binding name:

```ts
await kv('CONTENT_KV').set('page:home', page)

const contentCache = cache('CONTENT_CACHE', {
	defaultTtlSeconds: 600,
	prefix: 'content',
})
```

Applications can add domain-specific aliases without changing the package:

```ts
export const contentCache = () => cache('CONTENT_CACHE', { prefix: 'content' })
```

### Explicit construction and dependency injection

Global access is optional. Tests and libraries can construct and pass
dependencies explicitly:

```ts
import {
	createCloudflareKit,
	createKvCache,
	createKvStore,
} from '@standard-design/cloudflare-kit'

const cloudflare = createCloudflareKit({ env, ctx, request })
const store = createKvStore(env.CONTENT_KV)
const dataCache = createKvCache(env.CONTENT_CACHE, { prefix: 'content' })
```

No feature is activated during context creation. KV and Cache API resources are
only touched when their operations run. Applications may use only the
primitives and bindings they need.

## React Router 8

Cloudflare Kit has no React Router runtime dependency. Put the same inferred
request-scoped instance into an application-owned router context when loaders,
actions, or middleware prefer explicit access:

```ts
import {
	runWithCloudflareKit,
	type CloudflareKitContext,
} from '@standard-design/cloudflare-kit'
import {
	createContext,
	createRequestHandler,
	RouterContextProvider,
} from 'react-router'

export const cloudflareContext = createContext<CloudflareKitContext<Env>>()

const requestHandler = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
)

export default {
	fetch(request, env, ctx) {
		return runWithCloudflareKit({ ctx, env, request }, (cloudflare) => {
			const provider = new RouterContextProvider()
			provider.set(cloudflareContext, cloudflare)
			return requestHandler(request, provider)
		})
	},
} satisfies ExportedHandler<Env>
```

A loader in another file can choose either style:

```ts
import { cache } from '@standard-design/cloudflare-kit'
import type { Route } from './+types/products'
import { cloudflareContext } from '~/platform/cloudflare'

export async function loader({ context }: Route.LoaderArgs) {
	const cloudflare = context.get(cloudflareContext)
	const page = await cache('CONTENT_CACHE').getOrSet('products', loadProducts)

	return { page, requestUrl: cloudflare.request?.url }
}
```

Both paths resolve to the same request-local instance. React Router remains
outside the package.

## Workers KV

### General KV access

`createKvStore()` and `kv()` provide typed JSON `get`, `set`, `has`, `delete`,
and paginated `list` operations:

```ts
const store = kv('CONTENT_KV')

await store.set(
	'settings',
	{ title: 'Example' },
	{
		metadata: { source: 'studio' },
	},
)

const entry = await store.get<{ title: string }, { source: string }>('settings')
```

`env().require()` and direct KV reads check for `undefined` or `null`, not
truthiness, so `false`, `0`, and empty strings remain valid values.

### KV-backed data cache

`createKvCache()` and `cache()` store versioned JSON envelopes with a prefix and
TTL. They are separate from Cloudflare's HTTP Cache API:

```ts
const products = await cache('CONTENT_CACHE', {
	defaultTtlSeconds: 600,
	prefix: 'queries',
}).getOrSet('products', loadProducts, {
	bypass: previewEnabled,
})
```

The cache exposes `get`, `set`, `getOrSet`, `delete`, and `key`. Lookup results
use a `{ hit, value }` union, so cached `false`, `0`, empty strings, and `null`
are distinct from misses.

KV expiration TTLs below 60 seconds are rejected before a write. Workers KV is
eventually consistent, and `getOrSet()` is a convenience—not a distributed lock
or stampede-prevention primitive.

### Runtime parsing and Zod

Values can be validated with any synchronous parser. Cloudflare Kit does not
depend on a schema library:

```ts
import { kv } from '@standard-design/cloudflare-kit'
import * as z from 'zod'

const SettingsSchema = z.object({
	pageSize: z.number().int().positive(),
	theme: z.enum(['light', 'dark']),
})

const { value } = await kv('CONTENT_KV').get('settings', {
	parse: (input) => SettingsSchema.parse(input),
})
```

The parser receives decoded `unknown` JSON and returns the validated value. It
is not called for a missing direct-KV entry. Parser errors propagate rather than
turning invalid data into a cache miss.

## HTTP response caching

`withHttpCache()` wraps any handler that returns a `Response`. The `handler`
callback is the uncached request handler invoked on a cache miss or bypass:

```ts
return cloudflare.withHttpCache({
	cache: caches.default,
	handler: () => generateResponse(),
	policy: { defaultTtlSeconds: 300 },
	request,
})
```

The context method injects the current execution context. The standalone
subpath export accepts it explicitly:

```ts
import { withHttpCache } from '@standard-design/cloudflare-kit/http-cache'

return withHttpCache({
	cache: caches.default,
	context: ctx,
	handler: () => generateResponse(),
	request,
})
```

On a hit, `handler` is not called. On a miss, its response is returned while an
independent clone is written through `waitUntil()`. Existing `s-maxage` or
`max-age` is honored; otherwise the policy's default TTL is applied to the
cached clone.

### Cache complete React Router HTML

Placement defines the caching boundary. Wrapping a loader caches only that
loader or data response. To cache fully assembled HTML, wrap React Router's
top-level `requestHandler()`:

```ts
return runWithCloudflareKit({ ctx, env, request }, (cloudflare) => {
	const provider = new RouterContextProvider()
	provider.set(cloudflareContext, cloudflare)
	const handleRequest = () => requestHandler(request, provider)

	return cloudflare.withHttpCache({
		cache: caches.default,
		handler: handleRequest,
		policy: { defaultTtlSeconds: 300 },
		request,
	})
})
```

The top-level handler serves both document requests and `.data` requests. The
wrapper can cache both under distinct URLs. React Router documents this split in
its [server middleware guide](https://reactrouter.com/how-to/middleware). To
cache only complete documents, bypass `.data` requests before calling
`withHttpCache()`:

```ts
const pathname = new URL(request.url).pathname

if (pathname.endsWith('.data')) {
	return handleRequest()
}
```

### Authenticated and private routes

The default policy only caches `GET` requests with `200` responses. It bypasses
reads and writes for requests containing `Cookie`, `Authorization`, byte ranges,
`no-cache`, or `no-store`. It also refuses responses containing `Set-Cookie`,
`private`, `no-store`, or an unapproved `Vary` dimension.

That safely bypasses ordinary cookie-backed sessions. It also means harmless
analytics or consent cookies reduce cache hits. Do not disable
`skipRequestWithCookie` globally unless output is independent of every cookie.

Known private routes should bypass the wrapper before cache lookup:

```ts
const pathname = new URL(request.url).pathname
const isPrivateRoute =
	pathname.startsWith('/account') ||
	pathname.startsWith('/admin') ||
	pathname.startsWith('/auth')

if (isPrivateRoute) {
	return handleRequest()
}
```

Response `private` or `no-store` directives prevent new writes, but they are
only available after the handler runs. Pre-classifying private routes also
prevents an earlier public entry from being read.

### Cache keys, variation, and invalidation

Default keys strip `utm_*`, `fbclid`, `gclid`, and `msclkid`, then sort remaining
query parameters. A custom `stripQueryParameters` list replaces those defaults;
use an empty list to preserve every parameter.

Approve content-negotiation dimensions and encode them in the key. The Vary
allowlist alone does not construct separate variants. For an application whose
response varies by a validated language selection:

```ts
await cloudflare.withHttpCache({
	cache: caches.default,
	handler,
	policy: {
		allowedVaryHeaders: ['accept-language'],
		createCacheKey(input) {
			const url = new URL(input.url)
			url.searchParams.set('__cfkit_language', selectedLanguage)
			return new Request(url, { method: 'GET', headers: input.headers })
		},
	},
	request,
})
```

`selectedLanguage` and `handler` are application-owned and must use the same
language choice. See [keys, variation, and isolation](docs/http-cache.md#keys-variation-and-isolation)
for a complete example and environment separation.

Delete a response using the same normalized policy and request:

```ts
await cloudflare.deleteHttpCacheEntry({
	cache: caches.default,
	request: new Request('https://example.com/products?utm_source=email'),
})
```

The Workers Cache API is data-center local and does not use tiered caching.
Deletion therefore affects only the data center handling that execution. Use
Cloudflare's global purge mechanisms when global invalidation is required. See
Cloudflare's [Cache API documentation](https://developers.cloudflare.com/workers/runtime-apis/cache/)
for platform-level behavior.

## Package entry points

| Entry point                                    | Purpose                              |
| ---------------------------------------------- | ------------------------------------ |
| `@standard-design/cloudflare-kit`              | Complete public API                  |
| `@standard-design/cloudflare-kit/context`      | Request context and global accessors |
| `@standard-design/cloudflare-kit/env`          | Binding reader                       |
| `@standard-design/cloudflare-kit/kv`           | General Workers KV store             |
| `@standard-design/cloudflare-kit/kv-cache`     | KV-backed data cache                 |
| `@standard-design/cloudflare-kit/http-cache`   | HTTP Cache API orchestration         |
| `@standard-design/cloudflare-kit/types`        | Shared JSON and parser types         |
| `@standard-design/cloudflare-kit/package.json` | Package metadata                     |

Subpath imports let libraries depend on individual primitives. The scoped
context exposes the complete capability facade, but each helper is lazy.

## Sawkill migration

| Sawkill API                                     | Cloudflare Kit prerelease                              |
| ----------------------------------------------- | ------------------------------------------------------ |
| Singleton `CFKit.setup()`                       | `runWithCloudflareKit({ env, ctx }, callback)`         |
| `env().fetch(key)`                              | `env().require(key)`                                   |
| `kv()`                                          | `kv()` or `kv('BINDING_NAME')`                         |
| `cache()`                                       | `cache()` or `cache('BINDING_NAME', options)`          |
| `cache().fetch(key, loader)`                    | `cache().getOrSet(key, loader)`                        |
| `cache().purge(key)`                            | `cache().delete(key)`                                  |
| `CFKit.setup({ options: { withCache: true } })` | Explicit `cloudflare.withHttpCache({ ... })` placement |

The old private `0.0.0` package is not treated as a compatibility contract.

## Development and verification

```sh
pnpm install
pnpm verify
```

Verification includes Wrangler type generation, formatting, linting, strict
package and consumer typechecks, Workers-runtime tests, production builds,
an `npm publish ./dist --dry-run --access public --tag alpha`, `publint`, Are the Types Wrong analysis,
tarball-content assertions, and packed-consumer smoke tests.

The build assembles `dist/` as a self-contained package root containing only
compiled JavaScript, declarations with API comments, package metadata, the
README, LICENSE, THIRD_PARTY_NOTICES.md, and the Markdown guides in `docs/`. Source maps are omitted
so the package cannot embed TypeScript through `sourcesContent`. See
[packaging and verification](docs/prerelease.md) for the release sequence and
the limits of the automated checks.

Create the prerelease artifact from that package root:

```sh
pnpm release:pack
```

Publishing the repository root is intentionally blocked. A future npm release
must use `pnpm release:publish`, which builds and publishes `./dist` explicitly
with explicit public access under the `alpha` npm distribution tag. The generated
manifest also fixes the public npm registry, access, and tag through `publishConfig`.
Publishing requires separate approval and authorized npm authentication; CI only
verifies the package. See the [readiness checklist](docs/prerelease.md#npm-publication-readiness).

## License

MIT; see [LICENSE](LICENSE) for first-party terms and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the retained EdgeKit and
Type-Fest notices and the focused attribution audit.
