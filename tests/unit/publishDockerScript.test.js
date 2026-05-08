import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const root = resolve(__dirname, "../..");
const script = join(root, "scripts/publish-docker.sh");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function runPublishDocker({ remoteExists = false, args = [] } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "n9router-docker-test-"));
  const binDir = join(temp, "bin");
  const logFile = join(temp, "docker.log");
  const docker = join(binDir, "docker");

  mkdirSync(binDir);
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s ' "$@" >> "${logFile}"
printf '\\n' >> "${logFile}"
if [[ "$*" == "buildx version" ]]; then
  exit 0
fi
if [[ "$*" == buildx\\ imagetools\\ inspect* ]]; then
  ${remoteExists ? "exit 0" : "exit 1"}
fi
exit 0
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    "bash",
    [script, ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      encoding: "utf8",
    },
  );

  const dockerLog = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  rmSync(temp, { recursive: true, force: true });

  return {
    ...result,
    combinedOutput: `${result.stdout}${result.stderr}`,
    dockerLog,
  };
}

test("refuses to rebuild an existing remote version tag without force", () => {
  const result = runPublishDocker({ remoteExists: true });

  expect(result.status).toBe(1);
  expect(result.combinedOutput).toContain(
    `nightwalker8x/n9router:${version} already exists`,
  );
  expect(result.dockerLog).not.toContain("buildx build");
});

test("builds and pushes version plus latest tags when remote version is missing", () => {
  const result = runPublishDocker({ remoteExists: false });

  expect(result.status).toBe(0);
  expect(result.dockerLog).toContain(
    `--tag nightwalker8x/n9router:${version}`,
  );
  expect(result.dockerLog).toContain("--tag nightwalker8x/n9router:latest");
  expect(result.dockerLog).toContain("--platform linux/amd64,linux/arm64");
  expect(result.dockerLog).toContain("--push");
});

test("force rebuilds even when remote version tag exists", () => {
  const result = runPublishDocker({ remoteExists: true, args: ["--force"] });

  expect(result.status).toBe(0);
  expect(result.dockerLog).toContain("buildx build");
  expect(result.dockerLog).toContain(
    `--tag nightwalker8x/n9router:${version}`,
  );
});
