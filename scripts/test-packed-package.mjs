import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const projectDirectory = resolve(import.meta.dirname, '..')
const packageDirectory = join(projectDirectory, 'dist')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'cloudflare-kit-'))
const sourceManifest = JSON.parse(
	await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)
const packageManifest = JSON.parse(
	await readFile(join(packageDirectory, 'package.json'), 'utf8'),
)

try {
	const { stdout } = await exec(
		'npm',
		[
			'pack',
			packageDirectory,
			'--json',
			'--ignore-scripts',
			'--pack-destination',
			temporaryDirectory,
		],
		{ cwd: temporaryDirectory },
	)
	const packResult = JSON.parse(stdout)
	assert.ok(Array.isArray(packResult) && packResult.length === 1)

	const filename = packResult[0]?.filename
	assert.equal(typeof filename, 'string')
	const packedFiles = packResult[0]?.files?.map((file) => file.path)
	assert.ok(Array.isArray(packedFiles))
	for (const [subpath, target] of Object.entries(packageManifest.exports)) {
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
	assert.ok(packedFiles.includes('README.md'))
	assert.ok(packedFiles.includes('package.json'))
	const guides = (await readdir(join(projectDirectory, 'docs')))
		.filter((name) => name.endsWith('.md'))
		.sort()
	const requiredGuides = [
		'README.md',
		'environment.md',
		'explicit-injection.md',
		'http-cache.md',
		'kv-cache.md',
		'kv.md',
		'prerelease.md',
		'react-router.md',
		'request-context.md',
		'troubleshooting.md',
	]
	for (const guide of requiredGuides)
		assert.ok(guides.includes(guide), `Missing guide: ${guide}`)
	const sourceFiles = (
		await readdir(join(projectDirectory, 'src'), { recursive: true })
	).filter((name) => name.endsWith('.ts'))
	const expectedFiles = [
		'LICENSE',
		'README.md',
		'package.json',
		...guides.map((name) => `docs/${name}`),
		...sourceFiles.flatMap((name) => [
			name.replace(/\.ts$/, '.js'),
			name.replace(/\.ts$/, '.d.ts'),
		]),
	].sort()
	assert.deepEqual(
		[...packedFiles].sort(),
		expectedFiles,
		'Unexpected or missing packed files',
	)
	assert.ok(!packedFiles.some((path) => path.endsWith('.map')))
	assert.equal(packageManifest.main, './index.js')
	assert.equal(packageManifest.types, './index.d.ts')
	assert.equal(packageManifest.scripts, undefined)
	assert.equal(packageManifest.devDependencies, undefined)
	assert.equal(packageManifest.files, undefined)
	assert.equal(packageManifest.packageManager, undefined)
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
	const installedDirectory = dirname(installedPackage)
	for (const file of [
		'LICENSE',
		'README.md',
		...guides.map((name) => `docs/${name}`),
	]) {
		assert.equal(
			await readFile(join(installedDirectory, file), 'utf8'),
			await readFile(join(projectDirectory, file), 'utf8'),
			`Packed document differs: ${file}`,
		)
	}

	// Check relative links in the shipped layout, where src/ and test/ do not exist.
	for (const file of ['README.md', ...guides.map((name) => `docs/${name}`)]) {
		const markdown = await readFile(join(installedDirectory, file), 'utf8')
		for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
			const target = match[1]
			if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue
			const [relativePath, anchor] = target.split('#')
			const resolved = relativePath
				? posix.normalize(posix.join(posix.dirname(file), relativePath))
				: file
			assert.ok(
				packedFiles.includes(resolved),
				`Broken link in ${file}: ${target}`,
			)
			if (anchor) {
				const linkedText = await readFile(
					join(installedDirectory, resolved),
					'utf8',
				)
				const anchors = [...linkedText.matchAll(/^#{1,6} (.+)$/gm)].map(
					(heading) =>
						heading[1]
							.toLowerCase()
							.replace(/[^\p{L}\p{N}\s_-]/gu, '')
							.replace(/ /g, '-'),
				)
				assert.ok(
					anchors.includes(anchor),
					`Broken anchor in ${file}: ${target}`,
				)
			}
		}
	}
	for (const [file, text] of [
		['context.d.ts', 'Concurrent scopes stay separate'],
		['kv-cache.d.ts', 'parse runs on hits only'],
		['http-cache/types.d.ts', 'write allowlist only'],
		['env.d.ts', 'uses fallback only for undefined'],
	]) {
		assert.ok(
			(await readFile(join(installedDirectory, file), 'utf8')).includes(text),
			`Missing declaration documentation: ${file}`,
		)
	}

	// Compile standalone guide snippets against installed declarations, not src aliases.
	// App wiring and optional Zod snippets use "ts illustrative" and are not compiled.
	const exampleDirectory = join(consumerDirectory, 'examples')
	await mkdir(exampleDirectory)
	const coreExamples = []
	const routerExamples = []
	for (const guide of guides) {
		const markdown = await readFile(
			join(installedDirectory, 'docs', guide),
			'utf8',
		)
		let index = 0
		for (const match of markdown.matchAll(/^```ts\n([\s\S]*?)^```/gm)) {
			const filename = `${guide.replace(/\.md$/, '')}-${index++}.ts`
			await writeFile(
				join(exampleDirectory, filename),
				`${match[1]}\nexport {}\n`,
			)
			const examples = match[1].includes("from 'react-router'")
				? routerExamples
				: coreExamples
			examples.push(`examples/${filename}`)
		}
	}
	assert.ok(coreExamples.length > 0 && routerExamples.length > 0)
	// Reuse the development router only for integration typings; it is not a kit dependency.
	await symlink(
		join(projectDirectory, 'node_modules', 'react-router'),
		join(consumerDirectory, 'node_modules', 'react-router'),
		'dir',
	)
	for (const [name, files, skipLibCheck] of [
		['core', coreExamples, false],
		['router', routerExamples, true],
	]) {
		const config = `tsconfig.${name}.json`
		await writeFile(
			join(consumerDirectory, config),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					exactOptionalPropertyTypes: true,
					noUncheckedIndexedAccess: true,
					noEmit: true,
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					lib: ['ES2023', 'DOM', 'DOM.Iterable'],
					types: [],
					skipLibCheck,
				},
				files,
			}),
		)
		await exec(
			process.execPath,
			[join(projectDirectory, 'node_modules/typescript/bin/tsc'), '-p', config],
			{ cwd: consumerDirectory },
		)
	}
	process.stdout.write(
		`Verified ${packedFiles.length} packed files, ${guides.length} guides, and ${coreExamples.length + routerExamples.length} typed guide examples.\n`,
	)
} finally {
	await rm(temporaryDirectory, { force: true, recursive: true })
}
