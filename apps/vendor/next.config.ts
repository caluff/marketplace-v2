import type { NextConfig } from "next";

function getServerActionAllowedOrigins() {
  const configured = process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",") ?? [];
  const candidates = [
    process.env.RAILWAY_PUBLIC_DOMAIN,
    ...configured,
    // Orca forwards the vendor preview to localhost:7001 with a different host.
    process.env.NODE_ENV === "development"
      ? "marketplace-v2-2.orca.localhost:6136"
      : undefined,
  ];

  return candidates.flatMap((candidate) => {
    const value = candidate?.trim();
    if (!value) return [];

    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        return [];
      }
      return [url.host];
    } catch {
      return [];
    }
  }).filter((origin, index, origins) => origins.indexOf(origin) === index);
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: getServerActionAllowedOrigins(),
      // Group images within the API's 5 MiB payload cap, plus multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
