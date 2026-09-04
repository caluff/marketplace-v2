import type { NextConfig } from "next";

function getServerActionAllowedOrigins() {
  const configured = process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",") ?? [];
  const candidates = [process.env.RAILWAY_PUBLIC_DOMAIN, ...configured];

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
    },
  },
};

export default nextConfig;
