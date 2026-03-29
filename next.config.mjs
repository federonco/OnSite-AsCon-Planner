/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Avoid webpack splitting these into numbered async chunks for server Route Handlers
    // (stale/missing *.js chunk refs like ./682.js after HMR or refactors).
    serverComponentsExternalPackages: ["@supabase/supabase-js"],
  },
};

export default nextConfig;
