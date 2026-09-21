import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const projectDirectory = resolve(import.meta.dirname, '..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'cloudflare-kit-'))
const sourceManifest = JSON.parse(
	await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)

try {
	const { stdout } = await exec(
		'npm',
		[
			'pack',
			'--json',
			'--ignore-scripts',
			'--pack-destination',
			temporaryDirectory,
		],
		{ cwd: projectDirectory },
	)
	const packResult = JSON.parse(stdout)
	assert.ok(Array.isArray(packResult) && packResult.length === 1)

	const filename = packResult[0]?.filename
	assert.equal(typeof filename, 'string')
	const packedFiles = packResult[0]?.files?.map((file) => file.path)
	assert.ok(Array.isArray(packedFiles))
	for (const [subpath, target] of Object.entries(sourceManifest.exports)) {
		if (subpath === './package.json') continue
		assert.equal(typeof target, 'object')
		assert.ok(
			packedFiles.includes(target.import.slice(2)),
			`Missing JavaScript export target for ${subpath}`,
		)
		assert.ok(
			packedFiles.includes(target.types.slice(2)),
			`Missing type export target for ${subpath}`,
		)
	}
	assert.ok(packedFiles.includes('LICENSE'))
	assert.ok(packedFiles.includes('package.json'))
	assert.ok(!packedFiles?.some((path) => path.startsWith('src/')))
	assert.ok(!packedFiles?.some((path) => path.startsWith('test/')))
	assert.ok(!packedFiles?.some((path) => path.startsWith('scripts/')))
	const tarball = join(temporaryDirectory, filename)
	const consumerDirectory = join(temporaryDirectory, 'consumer')

	await writeFile(
		join(temporaryDirectory, 'package.json'),
		JSON.stringify({ private: true, type: 'module' }),
	)
	await mkdir(consumerDirectory)
	await writeFile(
		join(consumerDirectory, 'package.json'),
		JSON.stringify({ private: true, type: 'module' }),
	)
	await exec(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			'--no-package-lock',
			tarball,
		],
		{ cwd: consumerDirectory },
	)

	const smokeTest = `
import assert from 'node:assert/strict'
import * as main from '@standard/cloudflare-kit'
import * as context from '@standard/cloudflare-kit/context'
import * as env from '@standard/cloudflare-kit/env'
import * as httpCache from '@standard/cloudflare-kit/http-cache'
import * as kv from '@standard/cloudflare-kit/kv'
import * as kvCache from '@standard/cloudflare-kit/kv-cache'

assert.equal(typeof main.createCloudflareKit, 'function')
assert.equal(typeof context.createCloudflareKit, 'function')
assert.equal(typeof env.createEnvironment, 'function')
assert.equal(typeof httpCache.withHttpCache, 'function')
assert.equal(typeof kv.createKvStore, 'function')
assert.equal(typeof kvCache.createKvCache, 'function')
`
	await writeFile(join(consumerDirectory, 'smoke.mjs'), smokeTest)
	await exec(process.execPath, ['smoke.mjs'], { cwd: consumerDirectory })

	const installedPackage = join(
		consumerDirectory,
		'node_modules',
		'@standard',
		'cloudflare-kit',
		'package.json',
	)
	const manifest = JSON.parse(await readFile(installedPackage, 'utf8'))
	assert.equal(manifest.name, '@standard/cloudflare-kit')
	assert.equal(manifest.version, sourceManifest.version)
} finally {
	await rm(temporaryDirectory, { force: true, recursive: true })
}
