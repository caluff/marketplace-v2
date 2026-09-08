import type { NextConfig } from "next"
import { productImagePattern } from "./lib/product-image-config"

function getServerActionAllowedOrigins() {
  const configured =
    process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",") ?? []
  const candidates = [
    process.env.RAILWAY_PUBLIC_DOMAIN,
    ...configured,
    // Orca forwards the local preview to localhost:3000 with a different host.
    process.env.NODE_ENV === "development"
      ? "marketplace-v2.orca.localhost:6136"
      : undefined,
  ]

  return candidates
    .flatMap((candidate) => {
      const value = candidate?.trim()
      if (!value) return []

      try {
        const url = new URL(value.includes("://") ? value : `https://${value}`)
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        ) {
          return []
        }
        return [url.host]
      } catch {
        return []
      }
    })
    .filter((origin, index, origins) => origins.indexOf(origin) === index)
}

function getBackendImagePatterns() {
  try {
    const backendUrl = new URL(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "")

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
  experimental: {
    serverActions: {
      allowedOrigins: getServerActionAllowedOrigins(),
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...getBackendImagePatterns(),
      ...[
        productImagePattern(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_URL),
      ].flatMap((pattern) => (pattern ? [pattern] : [])),
    ],
  },
}

export default nextConfig
