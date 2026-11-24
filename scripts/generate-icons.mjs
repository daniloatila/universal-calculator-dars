import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const iconFolder = new URL("../apps/desktop/icons/", import.meta.url);
const source = await readFile(new URL("../apps/web/public/dars.svg", import.meta.url), "utf8");
const sizes = [16, 24, 32, 48, 64, 128, 256];
const entries = [];
const executablePath = process.env.DARS_CHROME_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.setContent(`<style>
    html,body { margin: 0; }
    svg { display: block; width: 100vw; height: 100vh; }
  </style>${source}`);
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    entries.push(await page.screenshot({ omitBackground: true }));
  }
} finally {
  await browser.close();
}

const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
entries.forEach((entry, index) => {
  const start = 6 + 16 * index;
  const sizeByte = sizes[index] % 256;
  directory.writeUInt8(sizeByte, start);
  directory.writeUInt8(sizeByte, start + 1);
  directory.writeUInt16LE(1, start + 4);
  directory.writeUInt16LE(32, start + 6);
  directory.writeUInt32LE(entry.length, start + 8);
  directory.writeUInt32LE(offset, start + 12);
  offset += entry.length;
});
await mkdir(iconFolder, { recursive: true });
await writeFile(new URL("icon.png", iconFolder), entries.at(-1));
await writeFile(new URL("icon.ico", iconFolder), Buffer.concat([directory, ...entries]));
