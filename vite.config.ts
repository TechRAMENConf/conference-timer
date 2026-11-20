import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { configDefaults, defineConfig, lazyPlugins, type Plugin } from "vite-plus";

function collectDistFiles(rootDir: string, dir = rootDir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectDistFiles(rootDir, fullPath));
    } else {
      const rel = relative(rootDir, fullPath).replaceAll("\\", "/");
      if (rel !== "sw.js" && !rel.startsWith(".")) {
        files.push(`./${rel}`);
      }
    }
  }
  return files;
}

function pwaPrecachePlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "pwa-precache-manifest",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const swPath = join(outDir, "sw.js");
      let swSource: string;
      try {
        swSource = readFileSync(swPath, "utf-8");
      } catch {
        return;
      }

      const files = ["./", ...collectDistFiles(outDir)].sort();
      const hash = createHash("sha256");
      for (const file of files) {
        if (file === "./") continue;
        hash.update(file);
        hash.update(readFileSync(join(outDir, file.slice(2))));
      }
      const version = hash.digest("hex").slice(0, 12);

      const patched = swSource
        .replace("__CACHE_VERSION__", version)
        .replace(
          /const PRECACHE_URLS = \[[\s\S]*?\];/,
          `const PRECACHE_URLS = ${JSON.stringify(files, null, 2)};`,
        );
      writeFileSync(swPath, patched, "utf-8");
    },
  };
}

// https://viteplus.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    "*": "vp check --fix",
  },
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
    tasks: {
      typecheck: {
        command: "vue-tsc --build",
      },
      "build:all": {
        command: "vp build",
        dependsOn: ["typecheck"],
      },
      verify: {
        command: ["vp check", "vp test", "vp run build:all"],
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
  plugins: lazyPlugins(() => [vue(), vueDevTools(), pwaPrecachePlugin()]),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
