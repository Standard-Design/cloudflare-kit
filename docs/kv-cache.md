# KV-backed data caching

Import `createKvCache` from `/kv-cache`, or use scoped `cache()` from the root.
Despite its name, `cache()` is not the Cloudflare HTTP Cache API. It stores
JSON data in a Workers KV namespace; a React Router loader can still assemble
and render that data into HTML afterward. Use [HTTP caching](http-cache.md)
when the reusable result is an entire response.

## Cache a value

```ts
import { createKvCache } from '@standard/cloudflare-kit/kv-cache'
import type { KvNamespaceLike } from '@standard/cloudflare-kit/kv'

export async function getProductCount(
	namespace: KvNamespaceLike,
	preview: boolean,
) {
	const dataCache = createKvCache(namespace, {
		prefix: 'production:products:v1',
		defaultTtlSeconds: 300,
	})
	return dataCache.getOrSet('count', () => 0, { bypass: preview })
}
```

On an ordinary call, `getOrSet` reads KV first. A hit returns the stored value.
A miss awaits `loader()`, then awaits storing its result, then returns that
result. A storage write failure rejects the whole call, even if the loader
succeeded. It does not use `waitUntil`, suppress errors, or coordinate loaders
across concurrent misses. Two requests can both load and write the same key.

With `bypass: true`, it skips both read and write and returns the loader result.
The previous cached value is left untouched. This is useful for authenticated
preview, but CFKit does not detect preview, cookies, or authorization here.
The application must pass the bypass decision on every relevant call.

## Keys, envelope, and hit semantics

The physical key is `${prefix}:${key}`. The default prefix is `cache`; an empty
prefix throws `TypeError`. `key(logicalKey)` returns the physical key for logging
or external invalidation. Pass the logical key to `get`, `set`, and `delete`;
passing the already-prefixed key would add the prefix twice.

Each value is stored inside `{ version: 1, value }`. A missing KV entry returns
`{ hit: false }`; a valid entry returns `{ hit: true, value }`. This preserves
cached `null`, `false`, `0`, and `''`. Test `hit`, never value truthiness:

```ts
import { createKvCache } from '@standard/cloudflare-kit/kv-cache'
import type { KvNamespaceLike } from '@standard/cloudflare-kit/kv'

export async function readCachedNull(namespace: KvNamespaceLike) {
	const dataCache = createKvCache(namespace)
	await dataCache.set('not-found', null)
	const result = await dataCache.get('not-found')
	if (result.hit) return { foundInCache: true, value: result.value }
	return { foundInCache: false }
}
```

A value without a supported envelope throws `InvalidCacheEntryError`; it is
not silently treated as a miss, evicted, or overwritten. General `kv().set`
values and KV cache entries are different formats. Isolate their key spaces.

## TTL is backing-store expiration

`defaultTtlSeconds` defaults to 300. `set` and `getOrSet` accept a per-write
`ttlSeconds` override. Both must be integers of at least 60; zero does not mean
disable caching. Use bypass for that. Each write passes the selected TTL as
KV's `expirationTtl`. Reads do not renew it.

The envelope has no timestamp or separate freshness clock. CFKit relies on KV
expiration and its consistency semantics; it has no stale-while-revalidate,
stale-if-error, or background refresh. A loader's source might itself be stale,
and concurrent or geographically separated reads can miss or see old data.
See [Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

Optional JSON `metadata` is forwarded on writes. Cache reads expose only the
value/hit state; use raw `namespace` operations if you need metadata inspection.

## Parse stored data and validate fresh data

`get(key, { parse })` and cache-hit reads in `getOrSet` pass the envelope's
`value` to a synchronous parser. The parser may validate or transform it, and
its exceptions propagate. It is invoked for a cached null value too.

**`parse` does not run on the loader's newly produced value.** Validate inside
the loader as well if you want both paths checked. Keep read and fresh values
compatible and avoid repeatedly transforming already-transformed data.

```ts
import { createKvCache } from '@standard/cloudflare-kit/kv-cache'
import type { KvNamespaceLike } from '@standard/cloudflare-kit/kv'

function parseCount(input: unknown): number {
	if (typeof input !== 'number' || !Number.isInteger(input) || input < 0) {
		throw new TypeError('Expected a non-negative integer')
	}
	return input
}

export function loadValidatedCount(
	namespace: KvNamespaceLike,
	fetchCount: () => Promise<unknown>,
) {
	return createKvCache(namespace).getOrSet(
		'count',
		async () => parseCount(await fetchCount()),
		{ parse: parseCount },
	)
}
```

Zod is optional and is not a CFKit dependency. In an application that has
installed it, the equivalent adapter is:

```ts illustrative
import * as z from 'zod'
const Count = z.number().int().nonnegative()
const value = await dataCache.getOrSet(
	'count',
	async () => Count.parse(await fetchCount()),
	{ parse: (input) => Count.parse(input) },
)
```

Here `dataCache` and `fetchCount` are application-owned. This optional Zod
snippet is illustrative; the package checks the equivalent plain parser above.
Async parsers and outputs such as `Date` are outside the JSON parser contract.

## Invalidation and isolation

`delete(logicalKey)` awaits a KV delete; it does not purge HTTP responses or
all keys sharing the prefix. Changing a prefix or schema version creates a new
key space but leaves older entries until they expire or are removed.

Choose namespace/prefix/key from environment, tenant, dataset, locale, schema,
and content identity as appropriate. Two deployments using the same namespace
and default `cache` prefix share entries. Request context isolation does not
prevent those collisions. Do not store authenticated or draft data in a public
key space. Eviction/retry, observability, and safe fallback policy belong to
the application; do not catch every parser error and silently cache a fallback.

## Source and tests

Implementation: `src/kv-cache.ts`, `src/kv-ttl.ts`, `src/types.ts`.
`test/kv-cache.test.ts` exercises falsey hits, the versioned envelope, prefix,
read-through behavior, bypass, and TTL rejection. See [HTTP cache](http-cache.md)
for the other caching layer and [errors](troubleshooting.md) for recovery choices.
