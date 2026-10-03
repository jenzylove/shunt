import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the API reads measured stock profiles from disk; ship them with the server functions
  outputFileTracingIncludes: {
    "/api/**": ["./public/data/**"],
    "/proof": ["./public/data/*.json"],
  },
};

export default nextConfig;
