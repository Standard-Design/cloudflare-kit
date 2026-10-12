import { createContext } from 'react-router'

import {
	bindings,
	createCloudflareKit,
	env as scopedEnvironment,
	kv,
	type CloudflareKitBindings,
	type CloudflareKitContext,
} from '@standard-design/cloudflare-kit'

interface WorkerEnv {
	COUNT: number
	EMPTY: string
	OPTIONAL?: string
	TEST_KV: KVNamespace
}

declare module '@standard-design/cloudflare-kit' {
	interface CloudflareKitBindings extends WorkerEnv {}
}

bindings().COUNT satisfies number
scopedEnvironment().optional('OPTIONAL') satisfies string | undefined
kv('TEST_KV')
// @ts-expect-error Unknown bindings must be rejected by module augmentation.
scopedEnvironment().require('UNKNOWN')
// @ts-expect-error Known non-KV bindings must not be accepted as KV names.
kv<CloudflareKitBindings>('COUNT')

declare const env: WorkerEnv
declare const ctx: ExecutionContext

const kit = createCloudflareKit({ ctx, env })
const context = createContext<CloudflareKitContext<WorkerEnv>>()

kit.environment.require('COUNT') satisfies number
kit.environment.require('EMPTY') satisfies string
kit.environment.optional('OPTIONAL') satisfies string | undefined
kit.kv(env.TEST_KV)
kit.kvCache(env.TEST_KV, { defaultTtlSeconds: 300 })
context satisfies ReturnType<
	typeof createContext<CloudflareKitContext<WorkerEnv>>
>

// @ts-expect-error Unknown bindings must be rejected by inference.
kit.environment.require('UNKNOWN')
