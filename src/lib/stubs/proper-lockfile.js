// No-op stub for proper-lockfile (missing from Next.js standalone build).
// The MITM child process can't resolve proper-lockfile. Since tokenPool.js
// uses it only for file-level locking on db.json (which is also handled by
// SQLite in the main process), this stub is safe.

function lockSync() {
  return () => {}; // dummy release function
}

function lock() {
  return Promise.resolve(() => {});
}

function unlock() {
  return Promise.resolve();
}

function check() {
  return Promise.resolve(false);
}

module.exports = { lockSync, lock, unlock, check };
