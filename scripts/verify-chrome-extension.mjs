import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(projectRoot, "chrome-extension");
const readJson = (name) => JSON.parse(readFileSync(resolve(extensionRoot, name), "utf8"));
const prod = readJson("manifest.json");
const local = readJson("manifest.local.json");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const collectMatches = (manifest) => manifest.content_scripts.flatMap((entry) => entry.matches);
const expectedPermissions = ["alarms", "storage"];

for (const [label, manifest] of [["producción", prod], ["local", local]]) {
  assert(manifest.manifest_version === 3, `El manifest de ${label} debe usar Manifest V3.`);
  assert(manifest.version === prod.version, "Los manifests deben conservar la misma versión.");
  assert(JSON.stringify([...manifest.permissions].sort()) === JSON.stringify(expectedPermissions),
    `El manifest de ${label} contiene permisos no aprobados.`);
  assert(manifest.background?.service_worker === "service-worker.js", `Falta el service worker en ${label}.`);
  assert(Array.isArray(manifest.content_scripts), `Faltan content scripts en ${label}.`);

  for (const entry of manifest.content_scripts) {
    for (const relativePath of [...(entry.js || []), ...(entry.css || [])]) {
      assert(existsSync(resolve(extensionRoot, relativePath)), `No existe ${relativePath}, referenciado por ${label}.`);
    }
  }
}

const prodMatches = collectMatches(prod);
assert(prodMatches.includes("https://mail.google.com/*"), "Producción no está habilitada para Gmail.");
assert(prodMatches.includes("https://sistema-de-atencion-al-cliente.vercel.app/*"), "Falta el dominio RAC de producción.");
assert(!prodMatches.some((match) => match.includes("localhost") || match === "<all_urls>"),
  "Producción no debe admitir localhost ni todos los sitios.");

const localMatches = collectMatches(local);
for (const expected of ["https://mail.google.com/*", "http://localhost:4000/*"]) {
  assert(localMatches.includes(expected), `El manifest local no contiene ${expected}.`);
}
assert(!localMatches.some((match) => match.includes("vercel.app")), "El manifest local no debe ejecutar el puente en producción.");
assert(!localMatches.includes("<all_urls>"), "El manifest local no debe admitir todos los sitios.");

const javascriptFiles = [
  "environment-config.js",
  "service-worker.js",
  "content/rac-bridge.js",
  "content/gmail-adapter.js",
  "content/gmail-content.js",
];
for (const relativePath of javascriptFiles) {
  const absolutePath = resolve(extensionRoot, relativePath);
  execFileSync(process.execPath, ["--check", absolutePath], { stdio: "pipe" });
  const source = readFileSync(absolutePath, "utf8");
  assert(!source.includes("innerHTML"), `${relativePath} no debe insertar HTML no confiable.`);
  assert(!source.includes("eval("), `${relativePath} no debe ejecutar texto como código.`);
}

const serviceWorkerSource = readFileSync(resolve(extensionRoot, "service-worker.js"), "utf8");
const gmailContentSource = readFileSync(resolve(extensionRoot, "content/gmail-content.js"), "utf8");
const racBridgeSource = readFileSync(resolve(extensionRoot, "content/rac-bridge.js"), "utf8");
assert(serviceWorkerSource.includes('message.type === "RAC_IDENTITY_SYNC"')
  && serviceWorkerSource.includes('message.type === "RAC_IDENTITY_GET"'),
"El service worker debe sincronizar y entregar la identidad RAC temporal.");
assert(racBridgeSource.includes('message.type === "RAC_IDENTITY_SYNC"'),
  "El puente RAC debe sincronizar la identidad autenticada.");
assert(gmailContentSource.includes('delegationSource = "gmail"')
  && gmailContentSource.includes('delegationSource = "rac"'),
"Gmail debe detectar delegación por encabezado y por comparación con RAC.");

for (const [environment, expectedOrigin] of [
  ["local", "http://localhost:4000"],
  ["production", "https://sistema-de-atencion-al-cliente.vercel.app"],
]) {
  const outputRoot = resolve(projectRoot, "dist", `chrome-extension-${environment}`);
  assert(existsSync(resolve(outputRoot, "manifest.json")), `No se generó la extensión ${environment}.`);
  const configSource = readFileSync(resolve(outputRoot, "environment-config.js"), "utf8");
  assert(configSource.includes(expectedOrigin), `La extensión ${environment} no apunta a ${expectedOrigin}.`);
  if (environment === "local") assert(!configSource.includes("vercel.app"), "La versión local contiene producción.");
  if (environment === "production") assert(!configSource.includes("localhost"), "La versión de producción contiene localhost.");
}

console.log(`Extensión Chrome ${prod.version}: manifiestos, permisos, archivos y sintaxis verificados.`);
