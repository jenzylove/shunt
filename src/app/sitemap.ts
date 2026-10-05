import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://shunt-eight.vercel.app";
  return ["", "/proof", "/research", "/privacy"].map((p) => ({ url: base + p, lastModified: new Date("2026-10-05") }));
}
