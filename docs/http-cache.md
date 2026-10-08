# HTTP response caching

Import from `@standard/cloudflare-kit/http-cache`, or use
`kit.withHttpCache()` inside a scoped or explicit kit. This helper caches a
complete `Response`: status, headers, and body, which may be HTML or data. The
application supplies a Cache API object. No KV binding is required, and
enabling a KV cache does not enable this response cache.

## The request lifecycle

```ts
import {
	withHttpCache,
	type CacheStorageLike,
	type WaitUntilContext,
} from '@standard/cloudflare-kit/http-cache'

export function servePublicPage(
	request: Request,
	cache: CacheStorageLike,
	context: WaitUntilContext,
) {
	return withHttpCache({
		cache,
		context,
		request,
		handler: () =>
			new Response('<h1>Public catalog</h1>', {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			}),
		policy: { defaultTtlSeconds: 300 },
	})
}
```

1. Resolve the policy and compute the key, even for a request that will bypass.
2. If request guards permit a read, await `cache.match(key)`. A hit returns
   immediately; the handler, router, and loaders inside it do not execute.
3. Otherwise await `handler()` once to produce the original response.
4. Check request and response write guards. If eligible and TTL is not zero,
   clone the response for storage.
5. Start `cache.put(key, clone)` and register its promise with `waitUntil`.
   Return the original response without awaiting that write.

The handler is the real uncached response producer, not a configuration callback.
`kit.withHttpCache` supplies only the execution context; the request and cache
remain explicit. An app normally supplies `caches.default` or an opened cache.
The minimal `CacheStorageLike` type describes one cache object's `match`, `put`,
and `delete` methods, not the global `caches` collection.

## Defaults and policy options

| Option                          | Default                    | Meaning and responsibility                                                                    |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `defaultTtlSeconds`             | `300`                      | Fallback when no valid response `s-maxage`/`max-age` exists; non-negative safe integer        |
| `cacheableMethods`              | `['GET']`                  | Request methods eligible for reads/writes, normalized to uppercase                            |
| `cacheableStatuses`             | `[200]`                    | Origin response statuses eligible for writes                                                  |
| `skipRequestWithAuthorization`  | `true`                     | Bypass nonempty, trimmed Authorization header                                                 |
| `skipRequestWithCookie`         | `true`                     | Bypass nonempty, trimmed Cookie header                                                        |
| `skipRequestWithRange`          | `true`                     | Bypass any Range header                                                                       |
| `skipResponseWithSetCookie`     | `true`                     | Reject writes with any Set-Cookie header                                                      |
| `skipIfRequestCacheControlHas`  | `['no-cache', 'no-store']` | Directive names blocking writes, and normally reads                                           |
| `bypassReadOnRequestNoCache`    | `true`                     | Apply request directive/Pragma blocking to reads; disabling this never permits blocked writes |
| `skipIfResponseCacheControlHas` | `['no-store', 'private']`  | Directive names blocking writes, regardless of a directive's value                            |
| `allowedVaryHeaders`            | `[]`                       | Every nonempty response Vary field must be approved; `*` is always rejected                   |
| `stripQueryParameters`          | Tracking patterns below    | Query names removed by the default key factory; supplied list replaces defaults               |
| `createCacheKey`                | Normalizing factory        | Custom factory overrides the default, including its stripping/sorting                         |

Supplied arrays replace defaults, rather than adding to them. Header/directive
names are matched case-insensitively. `Pragma` containing `no-cache` also blocks
writes and normally reads. A response's `private`/`no-store` is only known after
the handler runs: it cannot stop an earlier hit. The wrapper does not inspect
cookies, authenticate users, or infer preview from URL parameters.

The default request key uses GET even if you widen `cacheableMethods`. Allowing
POST or other methods without a complete custom key design can collide with
GET results; no request body hash is included. Disabling safety defaults also
does not override Cloudflare's own cache restrictions.

## TTL, headers, and backing storage

CFKit reads a valid non-negative integer `s-maxage` first, then `max-age`, then
the fallback. Quoted integer values are accepted. A chosen zero TTL prevents a
new write; it does not disable reads or remove old entries. Existing valid TTL
headers are retained on the clone. Otherwise CFKit replaces the clone's
`Cache-Control` with `public, s-maxage=<fallback>`; this can replace other
directives on that clone. The original response's headers remain unchanged,
so a later cache hit may carry a header that the original miss did not.

The guards do not reject response `no-cache` by default, and the fallback logic
is not a full HTTP revalidation engine. If your app emits that directive to
prohibit reuse, explicitly include it in `skipIfResponseCacheControlHas` along
with `private` and `no-store`, or bypass the wrapper. Malformed/unsupported TTL
syntax falls back rather than throwing. There is no conditional origin fetch,
stale refresh, or stale-on-error fallback in CFKit.

TTL controls intended freshness in the backing Cache API; CFKit has no separate
clock or storage guarantee. Cloudflare's cache is local to the handling data
center, may evict entries, and does not offer tiered caching through this API.
Local deletion is not a global purge. See the
[Cache API documentation](https://developers.cloudflare.com/workers/runtime-apis/cache/).

## Private, authenticated, and preview responses

Classify known sensitive paths before calling the wrapper. This prevents a
previously stored public response from being read when route policy changes:

```ts
import {
	withHttpCache,
	type WithHttpCacheOptions,
} from '@standard/cloudflare-kit/http-cache'

export async function serve(options: WithHttpCacheOptions, preview: boolean) {
	const path = new URL(options.request.url).pathname
	const privatePath = /^\/(account|admin|auth)(\/|$)/.test(path)
	if (preview || privatePath) return options.handler()
	return withHttpCache(options)
}
```

`preview` must come from the application's trusted preview/session decision.
Cookie and Authorization guards are conservative additional protection, not a
replacement for that decision. Keep final private responses marked
`Cache-Control: private, no-store` for downstream caches too. Authentication,
rate limiting, audit work, and headers that must run on every request belong
outside the cached handler or require bypass; a hit skips everything inside it.

Analytics cookies reduce hits because all nonempty Cookie headers bypass by
default. Do not remove identity-bearing cookies or disable that guard merely
to increase the hit rate. A preview URL with no cookie needs an app-owned bypass
before lookup. Purge/version old public entries when a route becomes private.

## Keys, variation, and isolation

`createHttpCacheKeyFactory()` starts from the request URL, removes names matching
`/^utm_/i`, `/^fbclid$/i`, `/^gclid$/i`, and `/^msclkid$/i`, sorts remaining query
names, and returns a GET Request carrying the original headers. Strings in a
custom strip list match case-insensitively. `[]` preserves every query parameter.
Sorting does not make distinct values equivalent; meaningful parameters must
stay in the key. Stateful regexes have `lastIndex` reset before each test.

The Vary allowlist is a write gate, not a variant-key generator. Keeping a header
on the Request does not prove a backing cache separates representations by that
header. Encode every content-changing dimension into a custom key, and make the
renderer use the same normalized dimension. For example, an app with two
supported language variants can derive and pass the selected language once:

```ts
import {
	withHttpCache,
	type CacheStorageLike,
	type WaitUntilContext,
} from '@standard/cloudflare-kit/http-cache'

export function serveLocalized(
	request: Request,
	cache: CacheStorageLike,
	context: WaitUntilContext,
	language: 'en' | 'fr',
	render: (language: 'en' | 'fr') => Promise<Response>,
) {
	return withHttpCache({
		request,
		cache,
		context,
		handler: () => render(language),
		policy: {
			allowedVaryHeaders: ['accept-language'],
			createCacheKey(input) {
				const url = new URL(input.url)
				// Reserved internal fields are overwritten, never trusted from input.
				url.searchParams.set('__cfkit_language', language)
				url.searchParams.set('__cfkit_environment', 'production')
				url.searchParams.set('__cfkit_schema', 'v1')
				url.searchParams.sort()
				return new Request(url, { method: 'GET', headers: input.headers })
			},
		},
	})
}
```

This custom factory intentionally retains original query parameters. If it also
needs tracking removal, compose that explicitly. The app supplies a validated
language and equivalent render behavior. Do not put tokens or raw session IDs
in keys. Hostname stays in these URL keys; deployments on the same hostname and
cache can still collide unless the app separates environment/release/content
versions. Named caches or separate bindings do not replace a tenancy design.

## Invalidation and lower-level APIs

`deleteHttpCacheEntry({ cache, request, policy? })` computes the same normalized
key as a read/write and awaits `cache.delete`. It returns the backing boolean.
Use the identical cache and key policy, including variant inputs. It does not
check request/response guards or delete every variant, prefix, KV entry, or
data-center copy. Invalidation after a content edit may need both KV and HTTP
layers updated; neither layer automatically invalidates the other.

The subpath also exports these building blocks:

- `resolveHttpCachePolicy`: fill defaults, normalize sets, validate fallback TTL.
- `shouldBypassHttpCacheRead` / `shouldWriteHttpCache`: policy eligibility only;
  the write check does not apply the separate zero-TTL preparation step.
- `parseCacheControl`: comma-split directives with lowercase names, last
  duplicate wins; flags are `true`. It is not a full quoted-string grammar.
- `hasAnyDirective`: case-insensitive presence test for supplied names.
- `getCacheTtlSeconds`: selected valid integer age or `null`; `0` is valid.

## Failure modes and streaming

Policy/key errors and `cache.match` failures reject before the handler runs;
the helper does not silently fail open. Handler failures and cloning errors
also propagate. Async `cache.put` rejection belongs to the registered background
promise; CFKit adds no logger or catch. A custom adapter that throws synchronously
from `put`, or a failing `waitUntil`, can still reject the request path.

The body is cloned, not converted to text, so complete streamed HTML can be
stored as it finishes. Cloning tees the stream and is not a guarantee of bounded
memory for huge/unevenly consumed bodies. Decide whether streaming, personalized,
or large responses should bypass, and observe storage/runtime failures. There
is no stampede protection or guarantee a later request sees a just-scheduled write.

## Source and tests

Implementation: `src/http-cache/{types,policy,cache-key,guards,cache-control,http-cache}.ts`.
Tests: `test/http-cache.test.ts` (policy doubles plus a local Workers Cache API
round trip). Those tests do not establish cross-region behavior, production
eviction, or every negotiated Vary combination. Continue with
[React Router](react-router.md) and [troubleshooting](troubleshooting.md).
