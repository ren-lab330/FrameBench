/// <reference types="vite/client" />

import type { FrameBenchApi } from "../../../shared/types";

declare global {
  interface Window {
    framebench: FrameBenchApi;
  }
}
