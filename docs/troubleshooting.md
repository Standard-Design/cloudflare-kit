# Errors and troubleshooting

CFKit exposes error classes from the root entrypoint. It does not turn errors
into HTTP responses, log them automatically, or retry operations. Applications
own the public error boundary, redacted diagnostics, retry policy, and any
decision to continue without a cache.

## Failure reference

| Failure                             | Where it happens                                                                   | What to inspect                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CloudflareKitContextError`         | Scoped accessor without a context; `request()` when no request was supplied        | Scope placement, module-level calls, duplicate package copies, non-HTTP execution |
| `MissingBindingError`               | Required binding is undefined with no fallback; named/default KV lookup is missing | Deployed bindings, generated Env, the `KV` default name                           |
| `InvalidTtlError`                   | KV TTL is not an integer of at least 60 seconds                                    | Units, zero/negative/fractional values, cache factory defaults                    |
| `InvalidCacheEntryError`            | Stored KV cache JSON is not the expected versioned envelope                        | Legacy/general-KV values at cache keys, prefix/schema changes                     |
| `TypeError`                         | Empty KV cache prefix, incompatible KV binding, invalid HTTP default TTL           | Factory options and actual binding methods                                        |
| Application parser error            | A stored value fails `parse`                                                       | Schema drift, corrupted data, parser transform assumptions                        |
| Storage/serialization/handler error | Reads, writes, cloning, JSON encoding, or user callback fails                      | Original error and call site; CFKit does not wrap every error                     |

The package errors extend `CloudflareKitError`, which extends `Error`. Their
messages may contain binding names or cache keys; there are no stable numeric
codes, HTTP status mappings, or automatic redaction. Parser exceptions and
platform failures are not necessarily `CloudflareKitError` instances.

```ts
import { CloudflareKitError } from '@standard/cloudflare-kit'

export async function serveSafely(
	work: () => Promise<Response>,
	recordFailure: (kind: string) => void,
) {
	try {
		return await work()
	} catch (error) {
		recordFailure(
			error instanceof CloudflareKitError ? error.name : 'UnexpectedError',
		)
		return new Response('Service unavailable', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' },
		})
	}
}
```

This is an application boundary for a response-producing service, not a drop-in
React Router loader wrapper: router redirects and intentionally thrown
Responses need their normal handling. Keep useful server diagnostics behind
access controls; do not serialize arbitrary caught objects or all bindings.

## A cache entry is present, but data looks missing

For general KV, `get` returns `null` for both a missing entry and stored JSON
null. For KV cache, inspect `result.hit`, not `if (result.value)`. Cached null,
false, zero, and empty string are valid hits. Check whether a key already has
the cache prefix and was accidentally prefixed twice. A general KV value under
a cache key is not a valid cache envelope.

Invalid envelopes and parser failures do not trigger a loader retry. If your
application deliberately evicts/reloads such values, scope that recovery to
known errors, log it safely, and validate the replacement before writing.
Changing the schema prefix is often clearer than accepting mixed formats.

## The HTTP handler never runs, or a private header has no effect

A cache hit returns before the handler. Its response is not rechecked against
current response guards. New `private`, `no-store`, or Set-Cookie headers cannot
invalidate an existing public entry. Bypass known private/preview routes before
lookup and remove or version entries after policy changes. Authentication or
preview known only inside a cached handler is too late to protect reads.

## Responses are not being cached

Check request method, Cookie, Authorization, Range, Cache-Control and Pragma;
then final status, Set-Cookie, Cache-Control, and Vary. The default permits only
GET/200 and no Vary dimensions. A zero selected TTL suppresses writes. The HTTP
fallback TTL accepts zero; a KV TTL does not.

Inspect promises submitted to `waitUntil` when testing. A returned HTTP response
does not prove that its background cache write completed or that the platform
stored it. Record failures in a supplied context wrapper if needed:

```ts
import type { WaitUntilContext } from '@standard/cloudflare-kit/http-cache'

export function observeBackgroundWork(
	ctx: WaitUntilContext,
	recordFailure: () => void,
): WaitUntilContext {
	return {
		waitUntil(promise) {
			ctx.waitUntil(
				promise.catch((error: unknown) => {
					recordFailure()
					throw error
				}),
			)
		},
	}
}
```

Pass that wrapper as `ctx` when constructing/scoping the kit, or as `context`
to the standalone helper. This observes the error and preserves rejection;
it does not retry or change an already returned response.

## Stale content or environment crossover

Inspect the actual namespace/cache and the physical key. ALS protects the
association between asynchronous work and its context; it cannot prevent two
contexts writing the same storage key. Include schema/environment/tenant
dimensions or configure separate resources. KV eventual consistency and HTTP
data-center locality also mean one successful delete is not proof of immediate
global invalidation. Remember to invalidate HTML and KV data separately.

## Testing without hiding failures

Use `createEnvironment` with small objects and explicit factory inputs for unit
tests. For Cache API tests, record `waitUntil` promises, then await them before
asserting storage behavior. Use Workers runtime tests for native binding shape
and integration, and deployed application tests for actual geographic caching,
resource permissions, authentication, and framework response behavior.

The repository tests do not simulate all platform failures or prove production
cache variation. Read [verification limits](prerelease.md#what-verification-proves)
before interpreting a green package build as application acceptance.

## Source and tests

Error definitions: `src/errors.ts`; call sites: `src/env.ts`, `src/context.ts`,
`src/kv-cache.ts`, `src/kv-ttl.ts`, and `src/http-cache/policy.ts`.
Related tests: `test/env.test.ts`, `test/context.test.ts`, `test/kv-cache.test.ts`,
and `test/http-cache.test.ts`. Return to the [documentation index](README.md).
