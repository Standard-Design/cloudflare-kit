/**
 * Connects per-execution bindings to explicit helpers and optional scoped access.
 * Keep this module server-side; each installed copy owns its own async store.
 * @see docs/request-context.md
 * @see docs/explicit-injection.md
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { CloudflareKitBindings } from './index.js'
import { createEnvironment, type EnvironmentReader } from './env.js'
import { CloudflareKitContextError, MissingBindingError } from './errors.js'
import {
	deleteHttpCacheEntry,
	type DeleteHttpCacheEntryOptions,
	type WaitUntilContext,
	withHttpCache,
	type WithHttpCacheOptions,
} from './http-cache/index.js'
import { createKvCache, type KvCache, type KvCacheOptions } from './kv-cache.js'
import { createKvStore, type KvNamespaceLike, type KvStore } from './kv.js'

/** Per-execution capabilities; neither a storage cache nor a frozen bindings copy. */
export interface CloudflareKitContext<
	Bindings extends object = CloudflareKitBindings,
> {
	/** Original bindings object, read-only at the type level; may contain secrets. */
	readonly bindings: Readonly<Bindings>
	/** Deletes one response key in the supplied cache; does not purge KV or all locations. */
	deleteHttpCacheEntry(
		options: Omit<DeleteHttpCacheEntryOptions, 'request'> & {
			request: Request
		},
	): Promise<boolean>
	/** Typed reader over the same bindings; performs no runtime schema validation. */
	readonly environment: EnvironmentReader<Bindings>
	/** Original execution context; only waitUntil is required by the kit. */
	readonly executionContext: WaitUntilContext
	/** Creates a JSON store for an actual namespace, not a binding-name string. */
	kv(namespace: KvNamespaceLike): KvStore
	/** Creates a KV data cache; default prefix is cache and default TTL is 300 seconds. */
	kvCache(namespace: KvNamespaceLike, options?: KvCacheOptions): KvCache
	/** Present only when the caller supplied a request; useful for non-HTTP scopes too. */
	readonly request?: Request
	/** Forwards already-started work with the execution-context receiver intact. */
	waitUntil(promise: Promise<unknown>): void
	/** Injects executionContext; cache and request still must be supplied explicitly. */
	withHttpCache(
		options: Omit<WithHttpCacheOptions, 'context'>,
	): Promise<Response>
}

/** Application-owned resources for one execution. Creating a kit performs no I/O. */
export interface CreateCloudflareKitOptions<Bindings extends object> {
	/** Worker context, or a test double that records/awaits background promises. */
	ctx: WaitUntilContext
	/** Actual binding object; inferred types do not verify deployed configuration. */
	env: Bindings
	/** Omit for non-HTTP work; the global request() accessor will then throw. */
	request?: Request
}

/**
 * Constructs explicit capabilities without entering AsyncLocalStorage scope.
 * Pass the result to services/tests, or use runWithCloudflareKit for global access.
 * This does not read KV, open caches, or require a binding named KV.
 */
export function createCloudflareKit<Bindings extends object>({
	ctx,
	env: workerBindings,
	request: workerRequest,
}: CreateCloudflareKitOptions<Bindings>): CloudflareKitContext<Bindings> {
	return {
		bindings: workerBindings,
		deleteHttpCacheEntry,
		environment: createEnvironment(workerBindings),
		executionContext: ctx,
		kv: createKvStore,
		kvCache: createKvCache,
		...(workerRequest === undefined ? {} : { request: workerRequest }),
		waitUntil(promise) {
			ctx.waitUntil(promise)
		},
		withHttpCache(options) {
			return withHttpCache({ ...options, context: ctx })
		},
	}
}

/** Receives the same context seen by scoped accessors and preserves its return type. */
export type CloudflareKitCallback<Bindings extends object, Result> = (
	cloudflare: CloudflareKitContext<Bindings>,
) => Result

// One store can carry differently typed executions. Types are established by the
// caller/augmentation, not inferred or validated from this runtime association.
const storage = new AsyncLocalStorage<unknown>()

/**
 * Runs a callback and its asynchronous call chain with a fresh request context.
 * Concurrent scopes stay separate; nested calls restore the surrounding scope.
 * Preserves the callback's value/promise and propagates its errors unchanged.
 * Scope propagation does not extend Worker lifetime: use waitUntil for background work.
 */
export function runWithCloudflareKit<Bindings extends object, Result>(
	options: CreateCloudflareKitOptions<Bindings>,
	callback: CloudflareKitCallback<Bindings, Result>,
): Result {
	const context = createCloudflareKit(options)
	return storage.run(context, () => callback(context))
}

/**
 * Returns the active kit. A generic argument is a type assertion, not validation.
 * @throws CloudflareKitContextError when called outside a scope.
 */
export function getCloudflareKit<
	Bindings extends object = CloudflareKitBindings,
>(): CloudflareKitContext<Bindings> {
	const context = storage.getStore()
	if (context === undefined) throw new CloudflareKitContextError()
	return context as CloudflareKitContext<Bindings>
}

/** Returns active bindings without copying or redacting them; requires a scope. */
export function bindings<
	Bindings extends object = CloudflareKitBindings,
>(): Readonly<Bindings> {
	return getCloudflareKit<Bindings>().bindings
}

/** Returns the scoped environment reader; call inside execution, not at module load. */
export function env<
	Bindings extends object = CloudflareKitBindings,
>(): EnvironmentReader<Bindings> {
	return getCloudflareKit<Bindings>().environment
}

/** String binding keys compatible with KV, including optional bindings that may be absent. */
export type KvBindingKey<Bindings extends object = CloudflareKitBindings> =
	Extract<
		{
			[Key in keyof Bindings]-?: NonNullable<
				Bindings[Key]
			> extends KvNamespaceLike
				? Key
				: never
		}[keyof Bindings],
		string
	>

function isKvNamespaceLike(value: unknown): value is KvNamespaceLike {
	return (
		typeof value === 'object' &&
		value !== null &&
		'delete' in value &&
		typeof value.delete === 'function' &&
		'get' in value &&
		typeof value.get === 'function' &&
		'getWithMetadata' in value &&
		typeof value.getWithMetadata === 'function' &&
		'list' in value &&
		typeof value.list === 'function' &&
		'put' in value &&
		typeof value.put === 'function'
	)
}

function resolveKvNamespace(
	bindingOrNamespace: KvNamespaceLike | string | undefined,
): KvNamespaceLike {
	if (isKvNamespaceLike(bindingOrNamespace)) return bindingOrNamespace

	const bindingName = bindingOrNamespace ?? 'KV'
	const namespace = Reflect.get(bindings(), bindingName) as unknown
	if (namespace === undefined) throw new MissingBindingError(bindingName)
	if (!isKvNamespaceLike(namespace)) {
		throw new TypeError(
			`Cloudflare binding is not a KV namespace: ${bindingName}`,
		)
	}
	return namespace
}

/** Resolves a named KV binding in the active scope; missing/invalid bindings throw. */
export function kv<Bindings extends object = CloudflareKitBindings>(
	bindingName: KvBindingKey<Bindings>,
): KvStore
/** Wraps an explicit namespace, or the default KV binding; still requires a scope. */
export function kv(namespace?: KvNamespaceLike): KvStore
export function kv(bindingOrNamespace?: KvNamespaceLike | string): KvStore {
	return getCloudflareKit().kv(resolveKvNamespace(bindingOrNamespace))
}

/** Creates a KV data cache using the scoped KV binding; not the HTTP Cache API. */
export function cache(options?: KvCacheOptions): KvCache
/** Resolves a named KV binding; options apply to this wrapper, not all future calls. */
export function cache<Bindings extends object = CloudflareKitBindings>(
	bindingName: KvBindingKey<Bindings>,
	options?: KvCacheOptions,
): KvCache
/** Wraps the supplied namespace as a data cache; still requires an active scope. */
export function cache(
	namespace: KvNamespaceLike,
	options?: KvCacheOptions,
): KvCache
export function cache(
	bindingNamespaceOrOptions?: KvNamespaceLike | KvCacheOptions | string,
	options?: KvCacheOptions,
): KvCache {
	const isOptions =
		typeof bindingNamespaceOrOptions === 'object' &&
		bindingNamespaceOrOptions !== null &&
		!isKvNamespaceLike(bindingNamespaceOrOptions)

	return getCloudflareKit().kvCache(
		resolveKvNamespace(isOptions ? undefined : bindingNamespaceOrOptions),
		isOptions ? bindingNamespaceOrOptions : options,
	)
}

/**
 * Returns the explicitly supplied request.
 * @throws CloudflareKitContextError outside a scope or when its request was omitted.
 */
export function request(): Request {
	const workerRequest = getCloudflareKit().request
	if (workerRequest === undefined) {
		throw new CloudflareKitContextError('request')
	}
	return workerRequest
}

/** Registers already-started background work on the active context; adds no catch/retry. */
export function waitUntil(promise: Promise<unknown>): void {
	getCloudflareKit().waitUntil(promise)
}
