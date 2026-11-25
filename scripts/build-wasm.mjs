import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const inheritedTarget = process.env.CARGO_TARGET_DIR;
const target = inheritedTarget || join(root, "target");
// Retain Wasm target_features so bindgen can generate the correct glue.
const env = { ...process.env, CARGO_TARGET_DIR: target, CARGO_PROFILE_RELEASE_STRIP: "none" };
const bindingTool = process.env.DARS_WASM_BINDGEN || "wasm-bindgen";

function run(executable, args, capture = false) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} exited with ${result.status ?? result.signal}`);
  }
  return result.stdout;
}

if (run(bindingTool, ["--version"], true).trim() !== "wasm-bindgen 0.2.130") {
  throw new Error("Install wasm-bindgen-cli 0.2.130 to match the pinned Rust dependency.");
}

run("cargo", ["build", "--locked", "--release", "-p", "dars-wasm", "--target", "wasm32-unknown-unknown"]);
run(bindingTool, [
  join(target, "wasm32-unknown-unknown", "release", "dars_wasm.wasm"),
  "--target", "web",
  "--out-dir", join(root, "apps", "web", "src", "wasm"),
  "--out-name", "dars_wasm",
]);

for (const tool of ["scientific", "algebra", "calculus", "linear_algebra", "geometry"]) {
  run("cargo", [
    "build", "--locked", "--release", "-p", "dars-tool-wasm", "--target", "wasm32-unknown-unknown",
    "--no-default-features", "--features", tool,
  ]);
  run(bindingTool, [
    join(target, "wasm32-unknown-unknown", "release", "dars_tool_wasm.wasm"),
    "--target", "web",
    "--out-dir", join(root, "apps", "web", "src", "tool-wasm", tool),
    "--out-name", "dars_tool_wasm",
  ]);
}
