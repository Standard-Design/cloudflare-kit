# React Router integration

CFKit has no React Router runtime dependency or adapter to install. The
application connects its Worker entrypoint to React Router and chooses whether
loaders use scoped imports, explicit router context, or service parameters.
These examples target the repository's React Router 8 API. Keep CFKit usage in
server modules and import only serializable results into UI code.

## Connect the same context to both access paths

Create the router context token in a small application module, not in the Worker
entrypoint. This avoids importing the server build from a loader merely to get
its context token. The complete wiring below accepts the app's already-created
router request handler:

```ts
import { createContext, RouterContextProvider } from 'react-router'
import {
	runWithCloudflareKit,
	type CloudflareKitContext,
	type KvNamespaceLike,
	type WaitUntilContext,
} from '@standard/cloudflare-kit'

type Bindings = { CONTENT_CACHE: KvNamespaceLike }
// Export from app/platform/context.ts in an application.
export const cloudflareContext = createContext<CloudflareKitContext<Bindings>>()

export function handleWorkerRequest(
	request: Request,
	env: Bindings,
	ctx: WaitUntilContext,
	handleRouter: (
		request: Request,
		provider: RouterContextProvider,
	) => Promise<Response>,
) {
	return runWithCloudflareKit({ env, ctx, request }, (kit) => {
		const provider = new RouterContextProvider()
		provider.set(cloudflareContext, kit)
		return handleRouter(request, provider)
	})
}
```

In the Worker entrypoint, create the router handler with your framework's
server-build module and pass it into this wrapper:

```ts illustrative
import { createRequestHandler } from 'react-router'
const handleRouter = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
)
// fetch(request, env, ctx) calls handleWorkerRequest(request, env, ctx, handleRouter).
```

The virtual build module, Vite environment fields, and generated `Env` belong
to the consuming application. This illustrative glue must be tested in that
app's build. CFKit's checks validate provider/context types, not a full generated
React Router application. Follow the framework's
[context integration guide](https://reactrouter.com/how-to/middleware) for your
installed version; do not add an older version's future flag by habit.

## Loader and helper ergonomics

In a route module, `context.get(cloudflareContext)` returns the kit set above.
Pass `kit.kvCache(kit.bindings.CONTENT_CACHE)` into a service for explicit
dependencies. Or, after [augmenting bindings](environment.md), a helper anywhere
on that request's server call chain may use:

```ts illustrative
// app/products.server.ts; loadProducts is the application's validated data fetch.
import { cache } from '@standard/cloudflare-kit'

export function readProducts(preview: boolean) {
	return cache('CONTENT_CACHE', { prefix: 'production:products:v1' }).getOrSet(
		'list',
		loadProducts,
		{ bypass: preview },
	)
}
```

Calling this from a server loader works because the outer handler established
the scope. A browser `clientLoader`, static build step, or unrelated later job
does not inherit the server request's context. Use explicit factories or start
a suitable execution scope where appropriate. Actions use the same context
access paths, but must decide which data/HTTP entries to invalidate after a
successful mutation. Do not cache mutation responses by widening method policy.

## Cache complete HTML at the outer response boundary

A KV-cached loader result still needs React rendering. To store the completed
document, place `withHttpCache` around the router's request handler. Here the
app elects to cache only known public document routes:

```ts
import {
	runWithCloudflareKit,
	type WaitUntilContext,
} from '@standard/cloudflare-kit'
import type { CacheStorageLike } from '@standard/cloudflare-kit/http-cache'

export function serveDocuments(
	request: Request,
	ctx: WaitUntilContext,
	responseCache: CacheStorageLike,
	handleRouter: () => Promise<Response>,
	preview: boolean,
) {
	return runWithCloudflareKit({ env: {}, ctx, request }, (kit) => {
		const pathname = new URL(request.url).pathname
		const isPublicDocument =
			pathname === '/about' || pathname.startsWith('/articles/')
		if (preview || !isPublicDocument || pathname.endsWith('.data')) {
			return handleRouter()
		}
		return kit.withHttpCache({
			request,
			cache: responseCache,
			handler: handleRouter,
		})
	})
}
```

Combine this boundary with the provider setup above in the real Worker, using
one outer scope and actual bindings. `preview` is the app's trusted decision
made before lookup. The public-route test is illustrative policy, not a route
manifest analyzer. Check all rendered parents/layouts as well as the leaf page:
public content can still be embedded in a personalized shell.

On a hit the final response is returned and router execution is skipped.
Per-request logging, authentication, nonce generation, or cookie rotation inside
that handler will also be skipped. Keep required checks outside, or bypass.
Private/preview responses should explicitly carry `private, no-store` headers.
The HTTP defaults additionally bypass cookie/authorization requests and reject
Set-Cookie writes, but they cannot discover every form of personalization.

## Document requests versus data requests

React Router uses HTML document responses and separate data requests during
navigation. If both are eligible for the wrapper, keep their URLs distinct;
never normalize a `.data` URL into its HTML URL. Preserve meaningful query
parameters, including route-selection parameters, and headers that change the
representation in your key design. The example above bypasses `.data` entirely;
it does not claim to identify every resource route or transport behavior in
every React Router version.

A data response can itself contain results from multiple loaders. All included
data must be public to share it. A loader's private header only prevents a new
write if it survives into the final Response; it cannot prevent a preexisting
hit at an outer boundary. Test final headers and bytes, not just loader return
values. Preview should bypass both the HTTP boundary and any inner KV data cache.

## Application acceptance checks

Exercise anonymous HTML and client navigation, signed-in sessions, preview
entry/exit URLs, cookie-setting responses, non-GET actions, language variants,
and updates that invalidate both layers. Confirm that request-bound helpers
still see their own bindings under concurrent requests. Inspect browser bundles
for server imports and secrets. These checks need the consuming app's actual
router build, sessions, and deployment configuration.

## Source and tests

CFKit implementation: `src/context.ts`, `src/http-cache/http-cache.ts`.
Examples reference React Router's `createContext`, `RouterContextProvider`, and
`createRequestHandler`, not CFKit exports. API checks: `test/types/public-api.test.ts`
and the packed guide examples. Runtime context/cache tests are in
`test/context.test.ts` and `test/http-cache.test.ts`. Read the [HTTP guide](http-cache.md)
before changing policy defaults, or return to the [index](README.md).
