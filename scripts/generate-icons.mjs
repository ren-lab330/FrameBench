import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const source = "logo.png";
const buildDir = "build";
const iconsetDir = join(buildDir, "icon.iconset");
const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

await mkdir(buildDir, { recursive: true });
await rm(iconsetDir, { recursive: true, force: true });
await mkdir(iconsetDir, { recursive: true });

await resize(source, join(buildDir, "icon.png"), 1024);
await resize(source, join("app", "renderer", "public", "icon.png"), 256);

for (const size of pngSizes) {
  await resize(source, join(buildDir, `icon-${size}.png`), size);
}

await resize(source, join(iconsetDir, "icon_16x16.png"), 16);
await resize(source, join(iconsetDir, "icon_16x16@2x.png"), 32);
await resize(source, join(iconsetDir, "icon_32x32.png"), 32);
await resize(source, join(iconsetDir, "icon_32x32@2x.png"), 64);
await resize(source, join(iconsetDir, "icon_128x128.png"), 128);
await resize(source, join(iconsetDir, "icon_128x128@2x.png"), 256);
await resize(source, join(iconsetDir, "icon_256x256.png"), 256);
await resize(source, join(iconsetDir, "icon_256x256@2x.png"), 512);
await resize(source, join(iconsetDir, "icon_512x512.png"), 512);
await resize(source, join(iconsetDir, "icon_512x512@2x.png"), 1024);

await execFileAsync("iconutil", ["-c", "icns", iconsetDir, "-o", join(buildDir, "icon.icns")]);
await writeIco(
  join(buildDir, "icon.ico"),
  await Promise.all([16, 32, 48, 64, 128, 256].map(async (size) => ({ size, bytes: await readFile(join(buildDir, `icon-${size}.png`)) })))
);

console.log("Generated build/icon.png, build/icon.icns, and build/icon.ico");

async function resize(input, output, size) {
  await mkdir(dirname(output), { recursive: true });
  await execFileAsync("sips", ["-z", String(size), String(size), input, "--out", output]);
}

async function writeIco(output, images) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  let offset = headerSize + directorySize;
  const directory = Buffer.alloc(directorySize);
  const imageBuffers = images.map((image, index) => {
    const entryOffset = index * 16;
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset);
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.bytes.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += image.bytes.length;
    return image.bytes;
  });

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.concat([header, directory, ...imageBuffers]));
}
