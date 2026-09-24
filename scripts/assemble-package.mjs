import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const projectDirectory = resolve(import.meta.dirname, '..')
const packageDirectory = join(projectDirectory, 'dist')
const sourceManifest = JSON.parse(
	await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)

const rewritePackagePath = (value) => {
	if (typeof value === 'string') {
		return value.startsWith('./dist/')
			? `./${value.slice('./dist/'.length)}`
			: value
	}

	if (Array.isArray(value)) return value.map(rewritePackagePath)

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				rewritePackagePath(entry),
			]),
		)
	}

	return value
}

const packageManifest = rewritePackagePath(sourceManifest)

delete packageManifest.devDependencies
delete packageManifest.files
delete packageManifest.packageManager
delete packageManifest.scripts

await Promise.all(
	['LICENSE', 'README.md'].map((filename) =>
		copyFile(
			join(projectDirectory, filename),
			join(packageDirectory, filename),
		),
	),
)
await writeFile(
	join(packageDirectory, 'package.json'),
	`${JSON.stringify(packageManifest, null, '\t')}\n`,
)
