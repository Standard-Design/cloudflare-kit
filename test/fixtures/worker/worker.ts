export default {
	fetch() {
		return new Response('Cloudflare Kit test worker')
	},
} satisfies ExportedHandler<Env>
