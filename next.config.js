{
  "name": "winesage",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "prebuild": "node scripts/bump-version.js",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.3.6",
    "react": "^18",
    "react-dom": "^18"
  }
}
