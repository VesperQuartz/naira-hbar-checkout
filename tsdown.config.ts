import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/**"],
	exports: true,
	css: {
		fileName: "globals.css",
	},
	dts: true,
});
