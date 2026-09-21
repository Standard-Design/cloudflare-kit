import { createContext } from 'react-router'

import {
	createCloudflareKit,
	type CloudflareKitContext,
} from '@standard/cloudflare-kit'

interface WorkerEnv {
	COUNT: number
	EMPTY: string
	OPTIONAL?: string
	TEST_KV: KVNamespace
}

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
