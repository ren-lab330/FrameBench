import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const destination = "dist/main/app/preload/index.cjs";

await mkdir(dirname(destination), { recursive: true });
await copyFile("app/preload/index.cjs", destination);
