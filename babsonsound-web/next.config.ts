import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The admin guides page reads these files at run time, so they must ship with the server function.
  outputFileTracingIncludes: { '/api/admin/docs': ['./content/docs/**/*'] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
