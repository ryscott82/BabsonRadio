import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";
import { LEGACY_REDIRECTS } from "./lib/siteNav";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The admin guides page reads these files at run time, so they must ship with the server function.
  outputFileTracingIncludes: { '/api/admin/docs': ['./content/docs/**/*'] },
  // Old addresses keep working (the Shows list moved onto the Library page).
  async redirects() {
    return LEGACY_REDIRECTS.map(r => ({ ...r, permanent: true }));
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      // Apple fetches this file with no extension: it must be served as JSON.
      { source: "/.well-known/apple-app-site-association", headers: [{ key: "Content-Type", value: "application/json" }] },
      // The studio PC page reads the mixer input for its level meter and picks audio outputs. Same policy, with the microphone allowed.
      { source: "/booth", headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" }] },
    ];
  },
};

export default nextConfig;
