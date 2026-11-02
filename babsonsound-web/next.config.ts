import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The admin guides page reads these files at run time, so they must ship with the server function.
  outputFileTracingIncludes: { '/api/admin/docs': ['./content/docs/**/*'] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      // The studio PC page reads the mixer input for its level meter and picks audio outputs. Same policy, with the microphone allowed.
      { source: "/booth", headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" }] },
    ];
  },
};

export default nextConfig;
