/** URL normalization for response keys; no application/tenant inference. @see docs/http-cache.md */
import type { CacheKeyFactory } from './types.js'

const DEFAULT_TRACKING_PARAMETERS = [
	/^utm_/i,
	/^fbclid$/i,
	/^gclid$/i,
	/^msclkid$/i,
]

function matchesParameter(
	parameter: string,
	pattern: RegExp | string,
): boolean {
	if (typeof pattern === 'string') {
		return parameter.toLowerCase() === pattern.toLowerCase()
	}

	// Global/sticky regexes must not depend on which request was tested last.
	pattern.lastIndex = 0
	return pattern.test(parameter)
}

/**
 * Returns GET Request keys with original headers, sorted queries, and selected
 * query names removed. Default names: utm_*, fbclid, gclid, msclkid (case-insensitive).
 * A supplied list replaces the defaults; [] preserves all parameters.
 * Header preservation alone does not guarantee variant isolation in the backend.
 */
export function createHttpCacheKeyFactory(
	stripQueryParameters: readonly (
		RegExp | string
	)[] = DEFAULT_TRACKING_PARAMETERS,
): CacheKeyFactory {
	return (request) => {
		const url = new URL(request.url)

		for (const parameter of [...url.searchParams.keys()]) {
			if (
				stripQueryParameters.some((pattern) =>
					matchesParameter(parameter, pattern),
				)
			) {
				url.searchParams.delete(parameter)
			}
		}

		url.searchParams.sort()
		return new Request(url, {
			headers: request.headers,
			method: 'GET',
		})
	}
}
