import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";

const PLATFORM = os.platform();
const DEBUG_PORT_START = 9400;
const DEBUG_PORT_END = 9499;
let lastObservedRunning = {};

const TARGETS = {
  "antigravity-app": {
    id: "antigravity-app",
    route: "/api/antigravity-app",
    displayName: "Antigravity AGY",
    logPrefix: "antigravity-app",
    installPaths: {
      darwin: ["/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"],
      win32: [
        "%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd",
        "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe",
        "%ProgramFiles%\\Antigravity\\Antigravity.exe",
      ],
      linux: [],
    },
    bundlePaths: {
      darwin: ["/Applications/Antigravity.app", "/Applications/AGY.app"],
    },
    processSearch: {
      darwin: ["Antigravity.app", "AGY.app"],
      win32: ["Antigravity.exe", "AGY.exe"],
      linux: ["antigravity", "agy"],
    },
  },
  "antigravity-app-v2": {
    id: "antigravity-app-v2",
    route: "/api/antigravity-app-v2",
    displayName: "Antigravity AGYv2",
    logPrefix: "antigravity-app-v2",
    installPaths: {
      darwin: ["/Applications/Antigravity.app/Contents/MacOS/Antigravity"],
      win32: [],
      linux: [],
    },
    bundlePaths: {
      darwin: ["/Applications/Antigravity.app"],
    },
    pathRequirements: {
      darwin: {
        all: ["/Applications/Antigravity.app/Contents/Resources/app.asar"],
        none: ["/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"],
      },
    },
    processSearch: {
      darwin: ["Antigravity.app"],
      win32: [],
      linux: [],
    },
  },
  "antigravity-ide": {
    id: "antigravity-ide",
    route: "/api/antigravity-ide",
    displayName: "Antigravity IDE",
    logPrefix: "antigravity-ide",
    installPaths: {
      darwin: ["/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"],
      win32: [],
      linux: [],
    },
    bundlePaths: {
      darwin: ["/Applications/Antigravity IDE.app"],
    },
    processSearch: {
      darwin: ["Antigravity IDE.app"],
      win32: [],
      linux: [],
    },
  },
};

export function getAntigravityTarget(id) {
  const target = TARGETS[id];
  if (!target) throw new Error(`Unknown Antigravity target: ${id}`);
  return target;
}

function resolveEnvPath(p, env = process.env) {
  return p.replace(/%([^%]+)%/g, (_, v) => env[v] || "");
}

function matchesPathRequirements(target, platform, existsSync, env) {
  const requirements = target.pathRequirements?.[platform];
  if (!requirements) return true;

  for (const tpl of requirements.all || []) {
    if (!existsSync(resolveEnvPath(tpl, env))) return false;
  }

  for (const tpl of requirements.none || []) {
    if (existsSync(resolveEnvPath(tpl, env))) return false;
  }

  return true;
}

export function detectAntigravityInstallation(target, {
  platform = PLATFORM,
  existsSync = fs.existsSync,
  env = process.env,
} = {}) {
  if (!matchesPathRequirements(target, platform, existsSync, env)) {
    return { installed: false, binary: null };
  }

  const installPaths = target.installPaths[platform] || [];
  for (const tpl of installPaths) {
    const resolved = resolveEnvPath(tpl, env);
    if (resolved && existsSync(resolved)) {
      return { installed: true, binary: resolved };
    }
  }
  return { installed: false, binary: null };
}

function isPortInUse(port) {
  try {
    if (PLATFORM === "win32") {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: "utf8", stdio: "pipe", timeout: 5000 });
      for (const line of output.split("\n").map(l => l.trim()).filter(Boolean)) {
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;
        const localAddress = parts[1] || "";
        const pid = parts[parts.length - 1] || "";
        if (localAddress.endsWith(`:${port}`) && /^\d+$/.test(pid) && pid !== "0") return true;
      }
      return false;
    }
    const output = execSync(`lsof -ti :${port}`, { encoding: "utf8", stdio: "pipe", timeout: 5000 }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function findFreePort(start = DEBUG_PORT_START, end = DEBUG_PORT_END) {
  const range = end - start + 1;
  const maxRandom = Math.min(10, range);
  for (let i = 0; i < maxRandom; i++) {
    const port = start + Math.floor(Math.random() * range);
    if (!isPortInUse(port)) return port;
  }
  for (let port = start; port <= end; port++) {
    if (!isPortInUse(port)) return port;
  }
  return null;
}

export function detectAntigravityProcesses(target) {
  const pids = [];
  try {
    const terms = target.processSearch[PLATFORM] || [];
    if (PLATFORM === "win32") {
      for (const name of terms) {
        try {
          const output = execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, {
            encoding: "utf8", stdio: "pipe", timeout: 5000,
          });
          if (!output.includes("No tasks") && output.includes(name.replace(".exe", ""))) {
            for (const line of output.split("\n").filter(l => l.includes(name.replace(".exe", "")))) {
              const match = line.match(/\s+(\d+)\s/);
              if (match) pids.push(parseInt(match[1], 10));
            }
          }
        } catch { /* not found */ }
      }
    } else {
      const flag = PLATFORM === "darwin" ? "-f" : "-x";
      for (const term of terms) {
        try {
          const output = execSync(`pgrep ${flag} "${term}"`, {
            encoding: "utf8", stdio: "pipe", timeout: 5000,
          });
          output.trim().split("\n").filter(Boolean).forEach(p => {
            const n = parseInt(p, 10);
            if (!Number.isNaN(n)) pids.push(n);
          });
        } catch { /* pgrep exit 1 = no match */ }
      }
    }
  } catch { /* ignore */ }
  return { running: pids.length > 0, pids: [...new Set(pids)] };
}

function logInstallPathOnRunningChange(target, installation, running) {
  const previous = lastObservedRunning[target.id];
  const changed = previous != null && previous !== running;
  lastObservedRunning[target.id] = running;

  if (changed && installation.installed && installation.binary) {
    console.log(`[${target.logPrefix}] Found app binary: ${installation.binary}`);
  }
}

function isMainProcess(ppid, comm) {
  return (
    ppid === 1 &&
    comm.includes("/Contents/MacOS/") &&
    !comm.includes("Helper") &&
    !comm.includes("chrome_crashpad_handler")
  );
}

function findMainPid(pids) {
  if (PLATFORM !== "darwin" || pids.length === 0) return null;
  try {
    const output = execSync(`ps -o pid=,ppid=,comm= -p ${pids.join(",")}`, {
      encoding: "utf8", stdio: "pipe", timeout: 5000,
    });

    const parentPids = new Set();
    for (const line of output.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = parseInt(parts[0], 10);
      const ppid = parseInt(parts[1], 10);
      const comm = parts.slice(2).join(" ");
      if (isMainProcess(ppid, comm)) return pid;
      if (ppid !== 1 && !pids.includes(ppid)) parentPids.add(ppid);
    }

    if (parentPids.size > 0) {
      const parentOutput = execSync(`ps -o pid=,ppid=,comm= -p ${[...parentPids].join(",")}`, {
        encoding: "utf8", stdio: "pipe", timeout: 5000,
      });
      for (const line of parentOutput.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const comm = parts.slice(2).join(" ");
        if (isMainProcess(ppid, comm)) return pid;
      }
    }
  } catch { /* ps command failed */ }
  return null;
}

function killProcesses(target, pids) {
  let killed = 0;
  if (PLATFORM === "darwin") {
    const mainPid = findMainPid(pids);
    if (mainPid) {
      console.log(`[${target.logPrefix}] Killing main process PID ${mainPid} (children will auto-terminate)`);
      try {
        execSync(`kill ${mainPid}`, { stdio: "pipe", timeout: 5000 });
        killed++;
      } catch { /* already exited */ }
    } else {
      console.warn(`[${target.logPrefix}] Could not identify main process, killing all ${pids.length} PIDs`);
      for (const pid of pids) {
        try {
          execSync(`kill ${pid}`, { stdio: "pipe", timeout: 5000 });
          killed++;
        } catch { /* already exited */ }
      }
    }
  } else if (PLATFORM === "win32") {
    for (const name of (target.processSearch.win32 || [])) {
      try {
        execSync(`taskkill /F /IM ${name}`, { stdio: "pipe", timeout: 5000 });
        killed++;
      } catch { /* ignore */ }
    }
  } else {
    for (const pid of pids) {
      try {
        execSync(`kill ${pid}`, { stdio: "pipe", timeout: 5000 });
        killed++;
      } catch { /* ignore */ }
    }
  }
  return killed;
}

function resolveAppBundle(target, binary) {
  const match = binary.match(/^(\/.*?\.app)\b/);
  if (match && fs.existsSync(match[1])) return match[1];
  for (const bundlePath of target.bundlePaths[PLATFORM] || []) {
    if (fs.existsSync(bundlePath)) return bundlePath;
  }
  return null;
}

function launchApplication(target, binary, args = []) {
  if (PLATFORM === "darwin") {
    const appBundle = resolveAppBundle(target, binary);
    if (appBundle) {
      const openArgs = ["-a", appBundle];
      if (args.length > 0) openArgs.push("--args", ...args);
      console.log(`[${target.logPrefix}] open ${openArgs.join(" ")}`);
      execSync(`open ${openArgs.map(a => `"${a}"`).join(" ")}`, {
        stdio: "ignore", timeout: 10000,
      });
      return null;
    }
    console.warn(`[${target.logPrefix}] .app bundle not found, falling back to direct spawn`);
  }

  if (PLATFORM === "win32") {
    const cmdLine = [binary, ...args].map(a => `"${a}"`).join(" ");
    console.log(`[${target.logPrefix}] start "" ${cmdLine}`);
    execSync(`start "" ${cmdLine}`, { stdio: "ignore", shell: true, timeout: 10000 });
    return null;
  }

  console.log(`[${target.logPrefix}] Spawning: ${binary} ${args.join(" ")}`);
  const child = spawn(binary, args, { detached: true, stdio: "ignore" });
  child.on("error", (err) => console.error(`[${target.logPrefix}] Spawn error: ${err.message}`));
  child.unref();
  return child.pid;
}

async function waitUntilStopped() {
  await new Promise(resolve => setTimeout(resolve, 500));
}

export function getAntigravityStatus(target) {
  const installation = detectAntigravityInstallation(target);
  const proc = detectAntigravityProcesses(target);
  logInstallPathOnRunningChange(target, installation, proc.running);

  return {
    id: target.id,
    name: target.displayName,
    route: target.route,
    installed: installation.installed,
    binary: installation.binary,
    running: proc.running,
    pids: proc.pids,
  };
}

export async function handleAntigravityGet(targetId) {
  return Response.json(getAntigravityStatus(getAntigravityTarget(targetId)));
}

export async function handleAntigravityPost(targetId, request) {
  const target = getAntigravityTarget(targetId);
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "relaunch";

    if (action !== "relaunch" && action !== "close") {
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (action === "close") {
      const proc = detectAntigravityProcesses(target);
      if (!proc.running) {
        return Response.json({ success: true, message: `${target.displayName} is not running` });
      }
      const killed = killProcesses(target, proc.pids);
      if (killed > 0) {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          await waitUntilStopped();
          if (!detectAntigravityProcesses(target).running) break;
        }
      }
      console.log(`[${target.logPrefix}] Closed ${killed} process(es)`);
      return Response.json({
        success: true,
        killed,
        message: `Closed ${target.displayName} (${killed} process(es) killed)`,
      });
    }

    const installation = detectAntigravityInstallation(target);
    if (!installation.installed) {
      return Response.json({
        success: false,
        error: `${target.displayName} not found. Expected binary at ${(target.installPaths[PLATFORM] || []).join(" or ")}`,
      }, { status: 404 });
    }

    const proc = detectAntigravityProcesses(target);
    if (proc.running) {
      const killed = killProcesses(target, proc.pids);
      if (killed > 0) {
        console.log(`[${target.logPrefix}] Killed ${killed} process(es), waiting for full shutdown...`);

        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          await waitUntilStopped();
          const check = detectAntigravityProcesses(target);
          if (!check.running) break;
          console.log(`[${target.logPrefix}] Still ${check.pids.length} process(es) alive, waiting...`);
        }

        console.log(`[${target.logPrefix}] Processes gone, settling 2s for resource cleanup...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const port = findFreePort(DEBUG_PORT_START, DEBUG_PORT_END);
    if (!port) {
      return Response.json({
        success: false,
        error: `No free debug port in range ${DEBUG_PORT_START}-${DEBUG_PORT_END}`,
      }, { status: 500 });
    }

    const launchArgs = [`--remote-debugging-port=${port}`];
    const pid = launchApplication(target, installation.binary, launchArgs);
    const statusLabel = proc.running ? "relaunched" : "launched";
    console.log(`[${target.logPrefix}] ${statusLabel}${pid ? ` with PID ${pid}` : ""}, debug port ${port}`);

    return Response.json({
      success: true,
      ...(pid != null && { pid }),
      port,
      status: statusLabel,
      wasRunning: proc.running,
      message: `${target.displayName} ${statusLabel} (debug port ${port})`,
    });
  } catch (error) {
    console.error(`[${target.logPrefix}] Error:`, error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
