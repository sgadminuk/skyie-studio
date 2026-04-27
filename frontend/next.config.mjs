import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Pin Turbopack's workspace root to this directory. There's a stray
  // pnpm-lock.yaml in $HOME that confuses the auto-detection otherwise.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
