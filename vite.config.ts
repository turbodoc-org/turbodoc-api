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
    }),
    devServer({
      adapter,
      entry: "src/index.tsx",
    }),
  ],
});
