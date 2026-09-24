process.stderr.write(
	'Publishing the repository root is disabled. Use `pnpm release:publish` to build and publish ./dist.\n',
)
process.exitCode = 1
