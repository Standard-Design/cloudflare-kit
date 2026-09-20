export type CacheControlDirectives = ReadonlyMap<string, string | true>

export function parseCacheControl(
	headerValue: string | null,
): CacheControlDirectives {
	const directives = new Map<string, string | true>()
	if (!headerValue) return directives

	for (const rawDirective of headerValue.split(',')) {
		const directive = rawDirective.trim()
		if (directive.length === 0) continue

		const separatorIndex = directive.indexOf('=')
		if (separatorIndex === -1) {
			directives.set(directive.toLowerCase(), true)
			continue
		}

		const name = directive.slice(0, separatorIndex).trim().toLowerCase()
		const rawValue = directive.slice(separatorIndex + 1).trim()
		const value =
			rawValue.startsWith('"') && rawValue.endsWith('"')
				? rawValue.slice(1, -1)
				: rawValue
		directives.set(name, value)
	}

	return directives
}

export function hasAnyDirective(
	directives: CacheControlDirectives,
	names: Iterable<string>,
): boolean {
	for (const name of names) {
		if (directives.has(name.toLowerCase())) return true
	}
	return false
}

function parseSeconds(value: string | true | undefined): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
	const seconds = Number(value)
	return Number.isSafeInteger(seconds) ? seconds : null
}

export function getCacheTtlSeconds(
	directives: CacheControlDirectives,
): number | null {
	return (
		parseSeconds(directives.get('s-maxage')) ??
		parseSeconds(directives.get('max-age'))
	)
}
