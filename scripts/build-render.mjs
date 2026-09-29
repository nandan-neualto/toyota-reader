import { spawnSync } from "node:child_process";
const env = { ...process.env, DEPLOY_TARGET: "render", NEXT_TELEMETRY_DISABLED: "1" };
for (const args of [["scripts/prepare-reader.mjs"], ["node_modules/next/dist/bin/next", "build", "--webpack"], ["scripts/write-cache.mjs", ".next-render"]]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
