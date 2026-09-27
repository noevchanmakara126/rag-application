import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the production image can be a slim
  // node:alpine layer with no node_modules copied in.
  output: "standalone",
  experimental: {
    // Pasted documents go through a Server Action; the 1 MB default is tight
    // for a long article. File uploads deliberately bypass Server Actions
    // entirely (see src/app/api/documents/upload/route.ts).
    serverActions: { bodySizeLimit: "8mb" },
  },
}

export default nextConfig
