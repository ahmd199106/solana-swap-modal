/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    cssChunking: true,
    optimizeCss: true,
    optimizeServerReact: true,
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: "http", hostname: "*" },
      { protocol: "https", hostname: "*" },
    ],
  },
  compiler: {
    ...(process.env.NODE_ENV === "production"
      ? {
          removeConsole: {
            exclude: ["error", "warn"],
          },
        }
      : {}),
  },
};

export default nextConfig;
