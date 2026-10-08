# Environment and bindings

Import `createEnvironment` from `/env` for explicit use, or `env()` and
`bindings()` from the root or `/context` inside a scope. These readers access
the object the Worker received. They do not read `process.env`, load `.env`
files, provision Cloudflare resources, or fetch secrets from an external store.

## Generate types, then connect global accessors

Generate the application's `Env` from its own Wrangler configuration. In an
application declaration file included by TypeScript, augment CFKit once:

```ts illustrative
// app/cloudflare.d.ts; Env comes from this application's Wrangler type generation.
import '@standard/cloudflare-kit'

declare module '@standard/cloudflare-kit' {
	interface CloudflareKitBindings extends Env {}
}
```

This is compile-time information. It does not ensure a configured secret exists
at deployment time. `createCloudflareKit` and `createEnvironment` infer types
directly from the object passed to them, so explicit usage needs no augmentation.
If multiple apps share a TypeScript program, avoid merging incompatible `Env`
types into the same interface; isolate projects or prefer explicit types.

## Reading values

```ts
import { createEnvironment } from '@standard/cloudflare-kit/env'

const environment = createEnvironment<{
	NAME: string
	ENABLED: boolean
	OPTIONAL?: string
}>({
	NAME: '',
	ENABLED: false,
})

const name = environment.require('NAME', 'fallback') // Still ''.
const enabled = environment.require('ENABLED') // Still false.
const optional = environment.optional('OPTIONAL') // undefined.
const fallback = environment.require('OPTIONAL', 'development')
const present = environment.has('OPTIONAL') // false.
const all = environment.all() // Original object, typed read-only.
```

Only `undefined` counts as missing for `require`. `null`, `false`, `0`, and
`''` remain valid values when the binding type allows them. A defined fallback
is used only when the value is `undefined`; otherwise `MissingBindingError`
is thrown. No string trimming, JSON parsing, truthiness check, or type coercion
occurs. Validate a URL, number range, or nonempty secret separately when needed.

`has` checks for an own property with a defined value. `optional` and `require`
use ordinary property access. Use normal Worker binding objects; do not treat
these helpers as validators for arbitrary objects with inherited properties.
`all()` and `bindings()` return the same original object, not a sanitized copy,
and the read-only annotation is not a runtime freeze.

## Named resources and optional capabilities

`kv()` and `cache()` default to the binding named `KV`. A missing `KV` does not
prevent context creation or environment reads; it fails when the default KV
accessor is called. An application with only `CONTENT_CACHE` can call
`cache('CONTENT_CACHE', { prefix: 'published:v1' })` and never use general KV.

Named KV arguments are restricted by `KvBindingKey<Bindings>` to string keys
whose non-null value fits `KvNamespaceLike`. At runtime the namespace must
provide `get`, `getWithMetadata`, `put`, `delete`, and `list` functions. Missing
bindings throw `MissingBindingError`; a present but incompatible binding throws
`TypeError`. Optional bindings can still be absent at runtime despite passing
the key-type check.

Bindings such as D1, R2, or service bindings remain available through the typed
environment reader. This version has no specialized D1 or R2 accessor. Using
one capability does not require enabling every other capability.

## Ownership, isolation, and secrets

The application owns namespace IDs, bindings for each deployment environment,
secret setup, and validation. A binding name is only a lookup name: pointing
staging and production at the same namespace shares storage. Request context
isolation does not change that. Use separate resources or deliberate prefixes
and follow the [cache isolation guidance](http-cache.md#keys-variation-and-isolation).

Never serialize `environment.all()`, `bindings()`, or a complete context in a
loader result. Missing-binding messages contain the key name but do not redact
application logs that include values. Log selected, nonsensitive fields.

## Source and tests

Implementation: `src/env.ts`, `src/context.ts`, and the augmentation interface
in `src/index.ts`. Tests: `test/env.test.ts`, `test/context.test.ts`, and
`test/types/public-api.test.ts`. See [errors](troubleshooting.md) for deployment
failures and [general KV](kv.md) for resource use.
