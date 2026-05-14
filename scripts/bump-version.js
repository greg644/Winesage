#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// Read current version from version.json
const versionPath = path.join(__dirname, "../public/version.json");
const indexPath = path.join(__dirname, "../pages/index.js");

const versionData = JSON.parse(fs.readFileSync(versionPath, "utf8"));
const current = versionData.version;

// Bump the patch number (1.1.0 -> 1.1.1)
const parts = current.split(".").map(Number);
parts[2] += 1;
const next = parts.join(".");

// Update version.json
fs.writeFileSync(versionPath, JSON.stringify({ version: next }, null, 2) + "\n");

// Update APP_VERSION in index.js
const index = fs.readFileSync(indexPath, "utf8");
const updated = index.replace(
  /const APP_VERSION = "[^"]+"/,
  `const APP_VERSION = "${next}"`
);
fs.writeFileSync(indexPath, updated);

console.log(`Version bumped: ${current} → ${next}`);
