import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") throw new Error("The portable EXE must be built on Windows.");
await stat(join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"));

// Use tracked build inputs only: personal saves, ignored artwork, local settings
// and extra music never enter the distribution staging directory.
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const privateArtwork = /^assets\/(?:enterprise\/Logo|university\/Logo|logo)\//i;
const inputs = tracked.filter((file) => !privateArtwork.test(file)
  && !/^src-tauri\/(?:target|gen)\//.test(file)
  && (/^(?:src|src-tauri|assets)\//.test(file) || /^(?:package(?:-lock)?\.json|index\.html|tsconfig(?:\.[\w-]+)?\.json|vite\.config\.ts)$/.test(file)));
if (!inputs.includes("src-tauri/tauri.conf.json")) throw new Error("Run this command from the CityGraph Git checkout.");

const stage = await mkdtemp(join(root, ".portable-build-"));
try {
  for (const file of inputs) {
    const target = join(stage, file); await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
  }
  await symlink(join(root, "node_modules"), join(stage, "node_modules"), "junction");
  const configuration = join(stage, "portable.tauri.json");
  await writeFile(configuration, JSON.stringify({ build: { beforeBuildCommand: "npm run build -- --logLevel error" } }));
  const targetDirectory = join(root, "src-tauri", "target");
  console.log(`Building Windows portable edition from ${inputs.length} tracked inputs (personal artwork excluded).`);
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--no-bundle", "--config", configuration], {
      cwd: stage, stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: targetDirectory },
    });
    child.on("error", fail);
    child.on("close", (code) => code === 0 ? done() : fail(new Error(`Portable build failed (${code}).`)));
  });
  const executable = join(root, "CityGraph.exe");
  await copyFile(join(targetDirectory, "release", "citygraph.exe"), executable);
  const info = await stat(executable);
  const instructions = await readFile(join(root, "运行说明.txt"), "utf8");
  if (!instructions.includes("CityGraph.exe")) throw new Error("Portable run instructions are missing.");
  console.log(`Ready: ${executable} (${(info.size / 1024 / 1024).toFixed(1)} MB). Double-click to play.`);
} finally {
  // Remove the dependency junction before cleaning our own staging directory.
  await unlink(join(stage, "node_modules")).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await rm(stage, { recursive: true, force: true });
}
