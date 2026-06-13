import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts", "src/bin.ts"],
    sourcemap: true,
    clean: true,
    dts: true,
    format: ["esm"],
    minify: true,
    target: "es2022",
});
