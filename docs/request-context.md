# Request context and global access

Import from `@standard/cloudflare-kit` or `/context` in server-only code.
`runWithCloudflareKit()` lets a helper in another file call `env()`, `kv()`, or
`cache()` without receiving a kit parameter. It uses AsyncLocalStorage to attach
one context to an asynchronous call chain. It does not store the current request
in a mutable global variable.

## Start one scope per execution

```ts
import {
	cache,
	runWithCloudflareKit,
	type KvNamespaceLike,
	type WaitUntilContext,
} from '@standard/cloudflare-kit'

// This helper can live in another server module.
async function readWelcomeMessage() {
	return cache().getOrSet('welcome', () => 'Hello')
}

export function handleRequest(
	request: Request,
	env: { KV: KvNamespaceLike },
	ctx: WaitUntilContext,
) {
	return runWithCloudflareKit({ env, ctx, request }, async () => {
		return new Response(await readWelcomeMessage())
	})
}
```

The application calls this from its Worker `fetch` handler, passing the actual
request, bindings, and execution context. `runWithCloudflareKit` creates a kit,
enters its scope, and invokes the callback with that same kit. It preserves the
callback's return type: a synchronous value stays synchronous; an async callback
returns its promise. Exceptions and promise rejections propagate.

Work started inside that scope retains its context across `await`. Concurrent
calls receive distinct contexts. When a nested scope returns, the surrounding
call chain resumes with its previous context. Calling an accessor outside any
scope throws; constructing a kit with `createCloudflareKit()` alone does not
enter a scope. See [explicit injection](explicit-injection.md).

## Accessor reference

| API                                | Result and behavior                                                |
| ---------------------------------- | ------------------------------------------------------------------ |
| `getCloudflareKit()`               | The current kit; the same object supplied to the callback          |
| `bindings()`                       | The original bindings object, typed as read-only                   |
| `env()`                            | An environment reader with `require`, `optional`, `has`, and `all` |
| `kv()`                             | A JSON store using the binding named `KV`                          |
| `kv('CONTENT_KV')`                 | A JSON store using a named KV binding                              |
| `kv(namespace)`                    | A store for an explicit namespace, still requiring a scope         |
| `cache(options?)`                  | A KV data cache using `KV`, with optional prefix/default TTL       |
| `cache('CONTENT_CACHE', options?)` | A data cache for a named binding                                   |
| `cache(namespace, options?)`       | A data cache for an explicit namespace, inside a scope             |
| `request()`                        | The supplied request, or an error if the scope omitted it          |
| `waitUntil(promise)`               | Forwards work to this execution's `ctx.waitUntil`                  |

Named accessors use the binding types from [module augmentation](environment.md).
All of these are functions: import them at module scope, but call them inside
request work. Do not write `const dataCache = cache()` at module initialization
or retain a kit in a module variable for later requests. Each accessor call can
create a new lightweight KV wrapper; object identity of those wrappers is not
the context's identity and is not an in-memory value cache.

## Background work is a separate lifetime decision

AsyncLocalStorage keeps context associated with work. It does not tell the
Worker runtime to keep that work alive after the response. Use `waitUntil` for
noncritical work that may finish later:

```ts
import { kv, waitUntil } from '@standard/cloudflare-kit'

export function saveNoncriticalMetric(key: string, value: number) {
	// Call inside a request scope; handle background failures in the application.
	waitUntil(
		kv()
			.set(key, value)
			.catch(() => {
				// Send a redacted failure metric to your application's logger here.
			}),
	)
}
```

For a write that must succeed before reporting success, `await` it instead.
CFKit forwards `waitUntil` with the original context receiver intact, but adds
no retry or durable job queue. Background execution is still subject to
[Workers lifecycle limits](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).
KV `getOrSet` awaits its own writes; HTTP caching uses `waitUntil` internally.

## Isolation, configuration, and limits

Each execution gets a new context, but `bindings` is the original object, not a
deep copy or frozen object. ALS does not isolate shared mutable values you put
inside it. It also does not partition KV namespaces or HTTP cache keys. Use
separate resources or explicit environment/tenant prefixes for stored data.

Scopes can wrap scheduled or queue work by supplying `env` and `ctx` without
`request`. In that case `kit.request` is `undefined` and `request()` throws
`CloudflareKitContextError`, even though the context itself exists.

The runtime must support `node:async_hooks`. Enable `nodejs_compat` in the
application's Worker configuration when needed, and check the current
[Cloudflare AsyncLocalStorage guidance](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/)
for your compatibility date. CFKit does not change compatibility flags.

If helpers cannot see a context, check the scope boundary, detached callbacks,
module-level calls, and duplicate installed copies of CFKit: each copy owns its
own AsyncLocalStorage instance. Passing a type argument to an accessor only
changes its static type; it does not validate actual bindings.

## Source and tests

Implementation: `src/context.ts`; public augmentation point: `src/index.ts`.
`test/context.test.ts` covers async propagation, concurrent isolation, default
and named KV access, context identity, and the `waitUntil` receiver. Nested
scopes follow AsyncLocalStorage semantics; they do not currently have a separate
package test. Continue with [bindings](environment.md) or [troubleshooting](troubleshooting.md).
