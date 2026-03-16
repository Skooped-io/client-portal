import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
}

export default withSentryConfig(nextConfig, {
  org: "skooped",
  project: "client-portal",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  sourcemaps: {
    disable: process.env.NODE_ENV !== 'production',
  },
})
