import type { NextConfig } from "next"

function getBackendImagePatterns() {
  try {
    const backendUrl = new URL(
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "",
    )

    if (backendUrl.protocol !== "https:") {
      return []
    }

    return [
      {
        protocol: "https" as const,
        hostname: backendUrl.hostname,
        port: backendUrl.port,
        pathname: "/**",
      },
    ]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: getBackendImagePatterns(),
  },
}

export default nextConfig
