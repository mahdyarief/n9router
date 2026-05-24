import { describe, it, expect } from "vitest";
import {
  detectAntigravityInstallation,
  getAntigravityTarget,
} from "../../src/lib/antigravity-ide-lib.js";

describe("antigravity-ide-lib", () => {
  it("maps antigravity-app to the existing Antigravity app binary", () => {
    const target = getAntigravityTarget("antigravity-app");

    expect(target.route).toBe("/api/antigravity-app");
    expect(target.displayName).toBe("Antigravity AGY");
    expect(target.installPaths.darwin).toEqual([
      "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity",
    ]);
    expect(target.processSearch.darwin).toEqual(["Antigravity.app", "AGY.app"]);
    expect(target.processSearch.win32).toEqual(["Antigravity.exe", "AGY.exe"]);
  });

  it("maps antigravity-ide to the new Antigravity IDE binary", () => {
    const target = getAntigravityTarget("antigravity-ide");

    expect(target.route).toBe("/api/antigravity-ide");
    expect(target.displayName).toBe("Antigravity IDE");
    expect(target.installPaths.darwin).toEqual([
      "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
    ]);
    expect(target.processSearch.darwin).toEqual(["Antigravity IDE.app"]);
    expect(target.processSearch.win32).toEqual(["Antigravity IDE.exe", "antigravity-ide.exe"]);
  });

  it("maps antigravity-app-v2 to the Antigravity v2 app bundle", () => {
    const target = getAntigravityTarget("antigravity-app-v2");

    expect(target.route).toBe("/api/antigravity-app-v2");
    expect(target.displayName).toBe("Antigravity AGYv2");
    expect(target.installPaths.darwin).toEqual([
      "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
    ]);
    expect(target.pathRequirements.darwin).toEqual({
      all: ["/Applications/Antigravity.app/Contents/Resources/app.asar"],
      none: ["/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"],
    });
    expect(target.processSearch.darwin).toEqual(["Antigravity.app"]);
    expect(target.processSearch.win32).toEqual(["Antigravity.exe"]);
  });

  it("detects installation from configured app paths only", () => {
    const target = getAntigravityTarget("antigravity-ide");
    const seen = [];
    const existsSync = (candidate) => {
      seen.push(candidate);
      return candidate === "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide";
    };

    expect(detectAntigravityInstallation(target, { platform: "darwin", existsSync })).toEqual({
      installed: true,
      binary: "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
    });
    expect(seen).toEqual([
      "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
    ]);
  });

  it("detects antigravity-app-v2 from the v2 bundle layout", () => {
    const target = getAntigravityTarget("antigravity-app-v2");
    const existingPaths = new Set([
      "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
      "/Applications/Antigravity.app/Contents/Resources/app.asar",
    ]);

    expect(detectAntigravityInstallation(target, {
      platform: "darwin",
      existsSync: (candidate) => existingPaths.has(candidate),
    })).toEqual({
      installed: true,
      binary: "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
    });
  });

  it("does not detect antigravity-app-v2 when the legacy v1 binary exists", () => {
    const target = getAntigravityTarget("antigravity-app-v2");
    const existingPaths = new Set([
      "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
      "/Applications/Antigravity.app/Contents/Resources/app.asar",
      "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity",
    ]);

    expect(detectAntigravityInstallation(target, {
      platform: "darwin",
      existsSync: (candidate) => existingPaths.has(candidate),
    })).toEqual({
      installed: false,
      binary: null,
    });
  });

  it("detects Windows AGY v1 from the legacy bin layout", () => {
    const target = getAntigravityTarget("antigravity-app");
    const env = { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" };
    const binary = "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd";

    expect(detectAntigravityInstallation(target, {
      platform: "win32",
      env,
      existsSync: (candidate) => candidate === binary,
    })).toEqual({
      installed: true,
      binary,
    });
  });

  it("detects Windows AGY v2 from the app.asar layout", () => {
    const target = getAntigravityTarget("antigravity-app-v2");
    const env = { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" };
    const binary = "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe";
    const existingPaths = new Set([
      binary,
      "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity\\resources\\app.asar",
    ]);

    expect(detectAntigravityInstallation(target, {
      platform: "win32",
      env,
      existsSync: (candidate) => existingPaths.has(candidate),
    })).toEqual({
      installed: true,
      binary,
    });
  });

  it("does not detect Windows AGY v2 from a v1 layout", () => {
    const target = getAntigravityTarget("antigravity-app-v2");
    const env = { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" };
    const existingPaths = new Set([
      "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe",
      "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd",
    ]);

    expect(detectAntigravityInstallation(target, {
      platform: "win32",
      env,
      existsSync: (candidate) => existingPaths.has(candidate),
    })).toEqual({
      installed: false,
      binary: null,
    });
  });

  it("detects Windows Antigravity IDE from its program directory", () => {
    const target = getAntigravityTarget("antigravity-ide");
    const env = { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" };
    const binary = "C:\\Users\\Ada\\AppData\\Local\\Programs\\Antigravity IDE\\Antigravity IDE.exe";

    expect(detectAntigravityInstallation(target, {
      platform: "win32",
      env,
      existsSync: (candidate) => candidate === binary,
    })).toEqual({
      installed: true,
      binary,
    });
  });

  it("reports uninstalled when no configured app path exists", () => {
    const target = getAntigravityTarget("antigravity-app");

    expect(detectAntigravityInstallation(target, {
      platform: "darwin",
      existsSync: () => false,
    })).toEqual({
      installed: false,
      binary: null,
    });
  });
});
