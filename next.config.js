/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: false, // We control this manually so update prompt works
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      // Never cache version.json
      urlPattern: /\/version\.json/,
      handler: "NetworkOnly",
    },
    {
      // Always try network first for pages, fall back to cache
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlinecache",
        expiration: {
          maxEntries: 200,
        },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
