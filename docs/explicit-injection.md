# Explicit construction and dependency injection

Import `createCloudflareKit` from the root or `/context`, or import individual
factories from `/env`, `/kv`, `/kv-cache`, and `/http-cache`. These are server
capabilities. Explicit injection means a function receives the capability it
needs as a parameter, so its dependencies are visible and replaceable in tests.

## Pass a small capability

```ts
import { createKvCache, type KvCache } from '@standard/cloudflare-kit/kv-cache'
import type { KvNamespaceLike } from '@standard/cloudflare-kit/kv'

export async function loadTitle(dataCache: Pick<KvCache, 'getOrSet'>) {
	return dataCache.getOrSet('title', () => 'Public catalog')
}

export function readCatalog(namespace: KvNamespaceLike) {
	const dataCache = createKvCache(namespace, {
		prefix: 'production:catalog:v1',
	})
	return loadTitle(dataCache)
}
```

No request-global scope is required by `createKvCache`. The factory returns
methods closing over the supplied namespace and options. It validates its
default TTL and prefix immediately; storage I/O happens when methods are used.
The service's narrow `Pick` type makes it clear that it needs caching, not
secrets, a request, or an execution context.

## Pass the complete context when appropriate

```ts
import {
	createCloudflareKit,
	type CloudflareKitContext,
	type KvNamespaceLike,
	type WaitUntilContext,
} from '@standard/cloudflare-kit'

type Bindings = { CONTENT_CACHE: KvNamespaceLike; SITE_NAME: string }

export async function renderCatalog(kit: CloudflareKitContext<Bindings>) {
	const title = kit.environment.require('SITE_NAME')
	const dataCache = kit.kvCache(kit.bindings.CONTENT_CACHE)
	const count = await dataCache.getOrSet('count', () => 42)
	return Response.json({ title, count })
}

export function handle(request: Request, env: Bindings, ctx: WaitUntilContext) {
	return renderCatalog(createCloudflareKit({ env, ctx, request }))
}
```

`createCloudflareKit({ env, ctx, request? })` constructs the same facade used
inside `runWithCloudflareKit`. It retains bindings, optional request, and
execution context; supplies an environment reader; and exposes KV factories.
`kit.withHttpCache(options)` injects `ctx` into the standalone HTTP helper.
You must still supply `request` and `cache` to that method; it does not default
to `kit.request` or `caches.default`. `deleteHttpCacheEntry` likewise requires
an explicit cache and request.

The instance's `kv(namespace)` and `kvCache(namespace, options?)` take actual
namespaces. The global `kv('NAME')` and `cache('NAME')` functions instead resolve
names from the active context. Do not swap these signatures when moving code
between styles.

## Mix styles without duplicate setup

An application's outer `runWithCloudflareKit` callback can pass its kit into a
service or router provider. Deep application helpers may still use global
accessors. The callback argument and `getCloudflareKit()` refer to the same
context; there is no second initialization step.

Prefer explicit arguments for libraries used by multiple applications, work
that may execute outside a Worker request, or tests that need small doubles.
Global access is convenient in request-bound application services. Neither
style changes caching semantics or resource permissions.

## Testing and ownership

Use real Workers bindings for integration tests and `KvNamespaceLike`,
`CacheStorageLike`, or `WaitUntilContext` doubles for isolated behavior. A
`waitUntil` double should record promises and let the test await them; merely
ignoring them can hide write failures. Factories do not swallow storage errors,
validate application schemas, or infer tenancy. Those remain application policy.

Do not reuse a kit created for one request in another request. Pass only safe,
serializable result data to browser components, never the kit itself.

## Source and tests

Implementation: `src/context.ts`, `src/kv.ts`, `src/kv-cache.ts`.
`test/context.test.ts` checks independent explicit contexts; HTTP test doubles
and pending-promise handling are in `test/http-cache.test.ts`. The strict API
fixture is `test/types/public-api.test.ts`. Return to the [index](README.md).
