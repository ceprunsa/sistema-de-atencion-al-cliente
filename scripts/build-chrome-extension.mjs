import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "chrome-extension");
const distRoot = resolve(projectRoot, "dist");
const requested = process.argv[2] || "all";
const environments = requested === "all" ? ["local", "production"] : [requested];

if (!environments.every((environment) => ["local", "production"].includes(environment))) {
  throw new Error("Usa local, production o all.");
}

const configurations = {
  local: {
    manifest: "manifest.local.json",
    folder: "chrome-extension-local",
    config: {
      environment: "local",
      targetAppOrigin: "http://localhost:4000",
      allowedAppOrigins: ["http://localhost:4000"],
      badgeText: "DEV"
    }
  },
  production: {
    manifest: "manifest.json",
    folder: "chrome-extension-production",
    config: {
      environment: "production",
      targetAppOrigin: "https://sistema-de-atencion-al-cliente.vercel.app",
      allowedAppOrigins: ["https://sistema-de-atencion-al-cliente.vercel.app"],
      badgeText: ""
    }
  }
};

mkdirSync(distRoot, { recursive: true });

for (const environment of environments) {
  const definition = configurations[environment];
  const target = resolve(distRoot, definition.folder);
  if (!target.startsWith(distRoot + "\\") && !target.startsWith(distRoot + "/")) {
    throw new Error("Destino de extensión no seguro.");
  }
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  cpSync(sourceRoot, target, { recursive: true });
  const manifest = readFileSync(resolve(sourceRoot, definition.manifest), "utf8");
  writeFileSync(resolve(target, "manifest.json"), manifest);
  rmSync(resolve(target, "manifest.local.json"), { force: true });
  writeFileSync(
    resolve(target, "environment-config.js"),
    `globalThis.RAC_EXTENSION_CONFIG = Object.freeze(${JSON.stringify(definition.config, null, 2)});\n`
  );
  console.log(`Extensión ${environment} generada en ${target}`);
}

