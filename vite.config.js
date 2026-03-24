import {defineConfig} from "vite";
import {resolve} from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/build.js"),
			formats: ["es"],
			fileName: () => "server-log-insights-tracking.js"
		},
		outDir: "dist",
		sourcemap: true,
		minify: "terser",
		terserOptions: {
			toplevel: true,
			ecma: 2015,
			mangle: {
				module: true
			}
		}
	}
});
