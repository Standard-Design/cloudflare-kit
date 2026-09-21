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

export interface CloudflareKitContext<
	Bindings extends object = CloudflareKitBindings,
> {
	readonly bindings: Readonly<Bindings>
	deleteHttpCacheEntry(
		options: Omit<DeleteHttpCacheEntryOptions, 'request'> & {
			request: Request
		},
	): Promise<boolean>
	readonly environment: EnvironmentReader<Bindings>
	readonly executionContext: WaitUntilContext
	kv(namespace: KvNamespaceLike): KvStore
	kvCache(namespace: KvNamespaceLike, options?: KvCacheOptions): KvCache
	readonly request?: Request
	waitUntil(promise: Promise<unknown>): void
	withHttpCache(
		options: Omit<WithHttpCacheOptions, 'context'>,
	): Promise<Response>
}

export interface CreateCloudflareKitOptions<Bindings extends object> {
	ctx: WaitUntilContext
	env: Bindings
	request?: Request
}

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

export type CloudflareKitCallback<Bindings extends object, Result> = (
	cloudflare: CloudflareKitContext<Bindings>,
) => Result

const storage = new AsyncLocalStorage<unknown>()

export function runWithCloudflareKit<Bindings extends object, Result>(
	options: CreateCloudflareKitOptions<Bindings>,
	callback: CloudflareKitCallback<Bindings, Result>,
): Result {
	const context = createCloudflareKit(options)
	return storage.run(context, () => callback(context))
}

export function getCloudflareKit<
	Bindings extends object = CloudflareKitBindings,
>(): CloudflareKitContext<Bindings> {
	const context = storage.getStore()
	if (context === undefined) throw new CloudflareKitContextError()
	return context as CloudflareKitContext<Bindings>
}

export function bindings<
	Bindings extends object = CloudflareKitBindings,
>(): Readonly<Bindings> {
	return getCloudflareKit<Bindings>().bindings
}

export function env<
	Bindings extends object = CloudflareKitBindings,
>(): EnvironmentReader<Bindings> {
	return getCloudflareKit<Bindings>().environment
}

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

export function kv<Bindings extends object = CloudflareKitBindings>(
	bindingName: KvBindingKey<Bindings>,
): KvStore
export function kv(namespace?: KvNamespaceLike): KvStore
export function kv(bindingOrNamespace?: KvNamespaceLike | string): KvStore {
	return getCloudflareKit().kv(resolveKvNamespace(bindingOrNamespace))
}

export function cache(options?: KvCacheOptions): KvCache
export function cache<Bindings extends object = CloudflareKitBindings>(
	bindingName: KvBindingKey<Bindings>,
	options?: KvCacheOptions,
): KvCache
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

export function request(): Request {
	const workerRequest = getCloudflareKit().request
	if (workerRequest === undefined) {
		throw new CloudflareKitContextError('request')
	}
	return workerRequest
}

export function waitUntil(promise: Promise<unknown>): void {
	getCloudflareKit().waitUntil(promise)
}
