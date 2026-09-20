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

	pattern.lastIndex = 0
	return pattern.test(parameter)
}

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
