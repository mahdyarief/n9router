#!/usr/bin/env node

/**
 * Postinstall hook for n9router.
 *
 * Purpose:
 * - Repair native modules that may be bundled from a different OS/arch
 * - Keep install non-fatal if rebuild fails (CLI should still start)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const pkgRoot = path.join(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function info(msg) {
  console.log(`[n9router:postinstall] ${msg}`);
}

function warn(msg) {
  console.warn(`[n9router:postinstall] ${msg}`);
}

function pathExists(target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function resolveStandaloneRoot() {
  const candidates = [
    path.join(pkgRoot, "app"),
    path.join(pkgRoot, ".next", "standalone"),
  ];

  return candidates.find((candidate) =>
    pathExists(path.join(candidate, "server.js"))
  );
}

function readMagic(binaryPath) {
  const fd = fs.openSync(binaryPath, "r");
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  return buffer.toString("hex");
}

function isBinaryValidForPlatform(binaryPath) {
  if (!pathExists(binaryPath)) return false;

  let magic = "";
  try {
    magic = readMagic(binaryPath);
  } catch {
    return false;
  }

  const isLinux = magic.startsWith("7f454c46"); // ELF
  const isMacOS = magic.startsWith("cffaedfe") || magic.startsWith("cefaedfe"); // Mach-O
  const isWindows = magic.startsWith("4d5a"); // PE (MZ)

  if (process.platform === "linux") return isLinux;
  if (process.platform === "darwin") return isMacOS;
  if (process.platform === "win32") return isWindows;

  return false;
}

function rebuildModule(moduleName, cwd) {
  execSync(`${npmCmd} rebuild ${moduleName} --build-from-source`, {
    cwd,
    stdio: "inherit",
    timeout: 180000,
  });
}

function tryPrebuildInstall(moduleRoot) {
  try {
    info("Attempting to download prebuilt better-sqlite3 binary...");
    execSync("npx prebuild-install --runtime electron --target 22.0.0 || npx prebuild-install", {
      cwd: moduleRoot,
      stdio: "pipe",
      timeout: 60000,
    });
    return true;
  } catch {
    return false;
  }
}

function ensureBetterSqlite3(locationName, moduleRoot) {
  if (!pathExists(moduleRoot)) {
    info(`Skipping ${locationName}: better-sqlite3 not present`);
    return;
  }

  const binaryPath = path.join(moduleRoot, "build", "Release", "better_sqlite3.node");
  if (isBinaryValidForPlatform(binaryPath)) {
    info(`better-sqlite3 already valid in ${locationName}`);
    return;
  }

  info(`Rebuilding better-sqlite3 in ${locationName} for ${process.platform}/${process.arch}`);

  // 1. Try to copy from root if this is the standalone target and root is already valid
  const rootModuleRoot = path.join(pkgRoot, "node_modules", "better-sqlite3");
  const rootBinaryPath = path.join(rootModuleRoot, "build", "Release", "better_sqlite3.node");

  if (moduleRoot !== rootModuleRoot && isBinaryValidForPlatform(rootBinaryPath)) {
    info(`Copying valid better-sqlite3 from root node_modules to ${locationName}`);
    try {
      fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
      fs.copyFileSync(rootBinaryPath, binaryPath);
      return;
    } catch (err) {
      warn(`Failed to copy better-sqlite3 from root: ${err.message}`);
    }
  }

  // 2. Try to download prebuilt binaries using prebuild-install
  const prebuiltPath = path.join(moduleRoot, "build", "Release", "better_sqlite3.node");
  if (tryPrebuildInstall(moduleRoot) && isBinaryValidForPlatform(prebuiltPath)) {
    info(`Downloaded prebuilt better-sqlite3 for ${locationName}`);
    return;
  }

  // 3. Fall back to rebuild from source, but only if we have the source files
  if (!pathExists(path.join(moduleRoot, "binding.gyp"))) {
    warn(`Cannot rebuild better-sqlite3 in ${locationName}: binding.gyp not found`);
    warn("API key usage limiting will be disabled. To fix, install build tools:");
    warn("  macOS: xcode-select --install");
    warn("  Linux: sudo apt-get install build-essential python3");
    warn("  Windows: npm install --global windows-build-tools");
    return;
  }

  try {
    rebuildModule("better-sqlite3", path.dirname(path.dirname(moduleRoot)));
  } catch (error) {
    warn(`Rebuild failed in ${locationName}: ${error.message}`);
    warn("API key usage limiting will be disabled.");
    warn("The app will still work - install just won't track per-key usage limits.");
    return;
  }

  if (isBinaryValidForPlatform(binaryPath)) {
    info(`better-sqlite3 rebuild succeeded in ${locationName}`);
  } else {
    warn(`better-sqlite3 still not valid in ${locationName} after rebuild`);
    warn("API key usage limiting will be disabled.");
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * When installed from npm (standalone mode), the open-sse directory lives
 * inside .next/standalone/open-sse but the runtime server.js expects it
 * at the parent level (__dirname/../open-sse = project root/open-sse).
 * This copies it there so the source path aliases resolve correctly.
 */
function copyOpenSse() {
  const standaloneRoot = resolveStandaloneRoot();
  if (!standaloneRoot) {
    info("Skipping open-sse copy: standalone app not present (dev install)");
    return;
  }

  const standaloneOpenSse = path.join(standaloneRoot, "open-sse");
  const parentOpenSse = path.join(standaloneRoot, "..", "open-sse");

  if (!pathExists(standaloneOpenSse)) {
    info("Skipping open-sse copy: open-sse not found in standalone dir");
    return;
  }

  info(`Copying open-sse → ${path.resolve(parentOpenSse)}`);
  try {
    copyDirSync(standaloneOpenSse, parentOpenSse);
    info("open-sse copy complete");
  } catch (error) {
    warn(`open-sse copy failed: ${error.message}`);
  }
}

function main() {
  const standaloneRoot = resolveStandaloneRoot();
  const targets = [
    {
      name: "root node_modules",
      moduleRoot: path.join(pkgRoot, "node_modules", "better-sqlite3"),
    },
  ];

  if (standaloneRoot) {
    targets.push({
      name: `${path.relative(pkgRoot, standaloneRoot)}/node_modules`,
      moduleRoot: path.join(standaloneRoot, "node_modules", "better-sqlite3"),
    });
  }

  let anySuccess = false;
  for (const target of targets) {
    const binaryPath = path.join(target.moduleRoot, "build", "Release", "better_sqlite3.node");
    ensureBetterSqlite3(target.name, target.moduleRoot);
    if (isBinaryValidForPlatform(binaryPath)) {
      anySuccess = true;
    }
  }

  // Summary message
  if (anySuccess) {
    info("better-sqlite3 is ready. API key usage limiting enabled.");
  } else if (targets.some(t => pathExists(t.moduleRoot))) {
    warn("better-sqlite3 could not be built. API key usage limiting disabled.");
    warn("To enable usage limits, reinstall with build tools installed.");
  }

  copyOpenSse();
}

main();
