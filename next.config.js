const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // Disable auto-registration - we'll register manually in ServiceWorkerRegister
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Disable in dev mode
  fallbacks: {
    document: '/offline', // Offline fallback page
  },
  // Exclude files that don't exist in App Router from precaching
  // This prevents the service worker from trying to cache app-build-manifest.json which doesn't exist in App Router
  buildExcludes: [
    /app-build-manifest\.json$/,
    /build-manifest\.json$/,
  ],
  runtimeCaching: [
    {
      // Next.js App Router RSC (React Server Components) requests - NetworkFirst
      // These are requests with ?_rsc= query parameter
      urlPattern: ({ url }) => {
        return url.searchParams.has('_rsc')
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'rsc-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        networkTimeoutSeconds: 3,
      },
    },
    {
      // App Router pages and navigation - NetworkFirst strategy
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        networkTimeoutSeconds: 3, // Try network first, fallback to cache after 3s
      },
    },
    {
      urlPattern: ({ url }) => url.pathname === '/offline',
      handler: 'CacheFirst',
      options: {
        cacheName: 'offline-page',
      },
    },    
    {
      // Next.js static assets - CacheFirst strategy for performance
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year (static assets are versioned)
        },
      },
    },
    {
      // Google Fonts - CacheFirst strategy
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        },
      },
    },
    {
      // Other external fonts and assets
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-fonts',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 365 * 24 * 60 * 60,
        },
      },
    },
  ],
})

module.exports = withPWA({
  reactStrictMode: true,
})
