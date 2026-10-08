# Documentation

These guides describe the current `@standard/cloudflare-kit` implementation.
Version `0.1.0-alpha.1` is being prepared with the same runtime API as alpha.0.
Alpha.1 builds include these guides and expanded editor hover documentation.
The existing alpha.0 tarball remains unchanged and does not contain these guides.

## Recommended reading order

Start with request context and bindings. Read explicit injection if you write
shared services or tests. Choose the KV guide for stored JSON, the KV cache guide
for reusable data, and the HTTP guide for complete responses. React Router apps
should then read the integration guide before enabling response caching.

| Guide                                            | What it explains                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| [Request context](request-context.md)            | Global accessors, AsyncLocalStorage, concurrent requests, and background work |
| [Explicit injection](explicit-injection.md)      | Passing a context or a small dependency into reusable functions               |
| [Environment and bindings](environment.md)       | Generated types, missing values, secrets, and named resources                 |
| [General KV](kv.md)                              | JSON storage, metadata, pagination, parsing, and expiration                   |
| [KV data cache](kv-cache.md)                     | Read-through caching, TTLs, falsey hits, parsing, and preview bypass          |
| [HTTP response cache](http-cache.md)             | Response lifecycle, guards, freshness, keys, variation, and invalidation      |
| [React Router](react-router.md)                  | Loader access, server helpers, complete HTML, and data responses              |
| [Errors and troubleshooting](troubleshooting.md) | Failures, safe logging, test doubles, and deployment checks                   |
| [Packaging and releases](prerelease.md)          | Installation, compiled artifacts, verification, and release ownership         |

## Shared terms

- **Binding:** a value Cloudflare supplies to a Worker, such as a secret or KV
  namespace. It is a handle to a configured resource, not the stored data itself.
- **Context:** one execution's bindings, optional request, and `waitUntil`
  capability, wrapped in a `CloudflareKitContext`.
- **Scope:** the callback and asynchronous work started within
  `runWithCloudflareKit()`. Accessors find the context attached to that work.
- **Factory:** a function that constructs helpers from explicit inputs. Creating
  a kit or KV wrapper does not perform a storage read or write.
- **KV store:** JSON storage with caller-chosen keys and optional expiration.
- **KV cache:** a layer over KV that adds a prefix, versioned envelope, mandatory
  expiration, and a hit/miss result. It stores data, not HTTP responses.
- **HTTP cache:** a supplied Cache API object that stores complete responses.
  It is separate from Workers KV, even when both are used by the same request.
- **TTL:** time to live in seconds. A cache lifetime is not a promise that the
  upstream content cannot change or that storage will retain an entry that long.
- **Parser:** a synchronous `(unknown) => Value` function that validates and may
  transform a stored value, or throws. A TypeScript generic is not a parser.
- **Handler / loader:** `withHttpCache` calls a response-producing `handler`;
  `getOrSet` calls a data-producing `loader`. Either may return a promise.
- **Bypass:** deliberately avoid a caching path, usually for private or preview
  content. The KV helper has a `bypass` option; HTTP route bypass is app-owned.

## Ownership and boundaries

The kit supplies accessors and small storage/cache operations. The application
owns resource provisioning, credentials, schema validation, authentication,
preview detection, cache keys, invalidation, deployment separation, and logging.
It also decides where response caching is safe and where errors become public
responses. The kit does not add routes, sessions, middleware, or database schemas.

Use CFKit in server modules. The root and `/context` entrypoints import
`node:async_hooks`; they are not browser entrypoints. The smaller factories are
useful for explicit injection, but passing a binding into them does not make
that binding safe to expose to the browser. Never return a kit or all bindings
as loader data.

## Examples and evidence

Standalone `ts` blocks in the guides are checked against the installed packed
package. React Router examples are checked separately against the repository's
installed router types. Blocks labeled `ts illustrative` explain application
glue or an optional integration and are not compiled by that check; the guide
states what the application supplies. Examples use fictional content and hosts.

Source and test paths are repository-relative references to this revision.
They are intentionally plain paths: source and tests are not shipped in the
compiled package. Public declarations, README, LICENSE, and these guides are
included in new builds. See the [package overview](../README.md) for a shorter
tour and the [verification limits](prerelease.md#what-verification-proves).
