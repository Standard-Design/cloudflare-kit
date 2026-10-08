# General Workers KV access

Import `createKvStore` from `@standard/cloudflare-kit/kv`, or call `kv()` inside
a request scope. This wrapper stores JSON with caller-chosen keys. Use it for
application-managed values; use [KV data caching](kv-cache.md) when you want
automatic load-on-miss behavior and explicit hit/miss results.

## Read and write JSON

```ts
import {
	createKvStore,
	type KvNamespaceLike,
} from '@standard/cloudflare-kit/kv'

export async function updateSettings(namespace: KvNamespaceLike) {
	const store = createKvStore(namespace)
	await store.set(
		'settings',
		{ theme: 'dark', pageSize: 20 },
		{
			expirationTtl: 3600,
			metadata: { schema: 1 },
		},
	)
	return store.get('settings', {
		parse(input) {
			if (
				typeof input !== 'object' ||
				input === null ||
				!('theme' in input) ||
				typeof input.theme !== 'string'
			)
				throw new TypeError('Invalid settings')
			return { theme: input.theme }
		},
	})
}
```

`set` serializes the value with `JSON.stringify` and awaits `namespace.put`.
`get` asks KV for decoded JSON plus metadata, optionally parses the value, and
returns `{ value, metadata }`. It does not parse metadata. Type arguments alone
trust the data; they do not check what an earlier deployment wrote.

## Public API and defaults

| Method                      | Behavior                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `get(key, { parse? })`      | Returns JSON value and metadata; a missing value is `null`                  |
| `set(key, value, options?)` | Awaits a JSON write; no default expiration or prefix                        |
| `has(key)`                  | Reads as text and checks against `null`, so stored JSON `null` still exists |
| `delete(key)`               | Awaits deletion; returns no existence result                                |
| `list(options?)`            | Returns one normalized page, not all keys                                   |
| `namespace`                 | The supplied raw namespace for operations outside this wrapper              |

Write options are `expiration` (absolute Unix seconds), `expirationTtl`
(relative seconds), and `metadata` (JSON object or `null`). CFKit checks a
supplied TTL is an integer of at least 60 seconds before sending the write.
Other platform constraints, including the interaction of expiration options,
remain the responsibility of KV. See
[Workers KV writes](https://developers.cloudflare.com/kv/api/write-key-value-pairs/).

Values and metadata should be JSON-compatible. Dates, BigInt, functions,
cyclic objects, and non-finite numbers do not preserve their intended meaning
through ordinary JSON. The static `JsonValue` type helps callers, but does not
perform deep runtime validation. Serialization and storage failures propagate.

## Null and falsey values

`false`, `0`, and `''` are preserved. Direct `get` cannot distinguish a stored
JSON `null` from a missing value; neither invokes the parser. `has` can check
existence, but a separate `has`/`get` pair is not atomic. If caching a null result
is useful, the envelope and `CacheLookup` union in [KvCache](kv-cache.md) solve
that ambiguity in a single cache read.

## Pagination

```ts
import {
	createKvStore,
	type KvNamespaceLike,
} from '@standard/cloudflare-kit/kv'

export async function listSettingKeys(namespace: KvNamespaceLike) {
	const store = createKvStore(namespace)
	const names: string[] = []
	let cursor: string | null = null

	for (;;) {
		const page: Awaited<ReturnType<typeof store.list>> = await store.list({
			cursor,
			prefix: 'settings:',
			limit: 100,
		})
		names.push(...page.keys.map((key) => key.name))
		if (page.done) return names
		cursor = page.cursor
	}
}
```

`list` accepts `cursor`, `prefix`, and `limit` and forwards them to KV. A complete
page has `done: true, cursor: null`; an incomplete page has a string cursor.
Stop on `done`, not on the number of keys in a page. Keys contain `name`, optional
`metadata`, and optional `expiresAt` (Unix seconds, renamed from KV's
`expiration`). Listing does not retrieve or validate the stored values.

## Consistency and application responsibility

Workers KV is eventually consistent. A successful write or delete is not a
global synchronization barrier; readers in different locations may observe
different states. CFKit adds no lock, transaction, retry, or compare-and-swap.
Avoid treating read/modify/write sequences as atomic counters or using cached
session revocation as an immediate global security boundary. See
[how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

All writes here are awaited. To move a noncritical write into background work,
the application must explicitly use `waitUntil` and handle failures. Prefixes,
tenant identity, expiration choices, access controls, and separate production
and preview namespaces are application-owned. General KV has no cookie or
authorization bypass logic.

## Source and tests

Implementation: `src/kv.ts`; TTL validation: `src/kv-ttl.ts`. Real local Workers
KV tests are in `test/kv.test.ts`. They cover writes with metadata, parsing,
and invalid TTL; they do not establish global consistency or test deployment
credentials. See [troubleshooting](troubleshooting.md) and the [index](README.md).
