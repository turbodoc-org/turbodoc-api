import build from "@hono/vite-build/cloudflare-workers";
import devServer from "@hono/vite-dev-server";
import adapter from "@hono/vite-dev-server/cloudflare";
import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  plugins: [
    build({
      entry: "src/index.tsx",
      entryContentBeforeHooks: [() => `import { BookmarkWorkflow } from '/src/index.tsx'`],
      entryContentAfterHooks: [
        () => `
					const merged = {}
					const definedHandlers = new Set()
					for (const [file, app] of Object.entries(modules)) {
						for (const [key, handler] of Object.entries(app)) {
							if (key !== 'fetch') {
								if (definedHandlers.has(key)) {
									throw new Error(\`Handler "\${key}" is defined in multiple entry files. Please ensure each handler (except fetch) is defined only once.\`)
								}
								definedHandlers.add(key)
								merged[key] = handler
							}
						}
					}
				`,
      ],
      entryContentDefaultExportHook: (appName) => `
				export default { ...merged, fetch: ${appName}.fetch }
				export { BookmarkWorkflow }
			`,
    }),
    devServer({
      adapter,
      entry: "src/index.tsx",
    }),
  ],
});
