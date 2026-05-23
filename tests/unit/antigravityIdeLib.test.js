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
  });

  it("maps antigravity-ide to the new Antigravity IDE binary", () => {
    const target = getAntigravityTarget("antigravity-ide");

    expect(target.route).toBe("/api/antigravity-ide");
    expect(target.displayName).toBe("Antigravity IDE");
    expect(target.installPaths.darwin).toEqual([
      "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
    ]);
    expect(target.processSearch.darwin).toEqual(["Antigravity IDE.app"]);
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
