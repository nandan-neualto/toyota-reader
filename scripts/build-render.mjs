import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const redirect = process.env.LIBRARY_REDIRECT_URL;
if (redirect) {
  const destination = new URL(redirect);
  if (destination.protocol !== "https:" || destination.username || destination.password) {
    throw new Error("LIBRARY_REDIRECT_URL must be an HTTPS URL without credentials.");
  }
  const url = destination.href;
  const htmlUrl = url.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const scriptUrl = JSON.stringify(url).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const output = resolve(".next-render");
  mkdirSync(output, { recursive: true });
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${htmlUrl}"><title>Toyota Employee Library</title><style>body{margin:0;background:#f5f3ef;color:#222;font:18px/1.6 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{padding:32px;max-width:600px}a{display:inline-block;padding:14px 22px;background:#c8102e;color:white;border-radius:8px;text-decoration:none}a:focus-visible{outline:3px solid #222;outline-offset:4px}</style></head><body><main><h1>Toyota Employee Library</h1><p>The library has moved. Opening the employee library…</p><a href="${htmlUrl}">Open the library</a></main><script>window.location.replace(${scriptUrl});</script></body></html>
`;
  writeFileSync(resolve(output, "index.html"), html);
  writeFileSync(resolve(output, "404.html"), html);
  console.log(`Legacy reader forwarding page prepared for ${destination.origin}.`);
} else {
  const env = { ...process.env, DEPLOY_TARGET: "render", NEXT_TELEMETRY_DISABLED: "1" };
  for (const args of [["scripts/prepare-reader.mjs"], ["node_modules/next/dist/bin/next", "build", "--webpack"], ["scripts/write-cache.mjs", ".next-render"]]) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
