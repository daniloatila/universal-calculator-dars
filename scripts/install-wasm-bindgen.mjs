import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const platforms = {
  "linux-x64": {
    target: "x86_64-unknown-linux-musl",
    executable: "wasm-bindgen",
    sha256: "9687f3bb551b9f66f37ed32a40d7913a00f7962db653054e56857bc306c3227f",
  },
  "win32-x64": {
    target: "x86_64-pc-windows-msvc",
    executable: "wasm-bindgen.exe",
    sha256: "844d23f1b56097549b936dd2e0d561fadebc1e8c9e985d5068b6b919654104ad",
  },
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    executable: "wasm-bindgen",
    sha256: "b90ddb9357f584b1af897d58ad77e4cce2b48fc17e2a967bc249a87f72809444",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    executable: "wasm-bindgen",
    sha256: "eb209c115b7cb95832423c1aa3f4d06d6c53f63ef74fc4b6fb79ef0b2eea5f10",
  },
};
const version = "0.2.130";
const platform = platforms[`${process.platform}-${process.arch}`];
if (!platform) throw new Error(`Install wasm-bindgen-cli ${version} with Cargo on this platform.`);

const folder = fileURLToPath(new URL("../.tooling/wasm-bindgen-ci/", import.meta.url));
const release = `wasm-bindgen-${version}-${platform.target}`;
const downloaded = await fetch(
  `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${version}/${release}.tar.gz`,
  { signal: AbortSignal.timeout(90_000) },
);
if (!downloaded.ok) throw new Error(`wasm-bindgen release download failed: ${downloaded.status}`);
const bytes = Buffer.from(await downloaded.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== platform.sha256) {
  throw new Error("wasm-bindgen release checksum mismatch.");
}
await mkdir(folder, { recursive: true });
const archive = join(folder, `${release}.tar.gz`);
await writeFile(archive, bytes);
execFileSync("tar", ["-xzf", archive, "-C", folder, "--strip-components", "1", `${release}/${platform.executable}`], { stdio: "inherit" });
const executable = join(folder, platform.executable);
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `DARS_WASM_BINDGEN=${executable}\n`);
}
console.log(execFileSync(executable, ["--version"], { encoding: "utf8" }).trim());
