const { detectBrokenPromises } = require('./engine/commitmentEngine');

// How often to sweep for broken promises. detectBrokenPromises() already
// safely excludes anything recovered before flagging a promise as broken
// (see commitmentEngine.js), so this can run frequently without risk of
// false positives — an hour keeps a broken promise from sitting stale for
// long without hammering the database on a busy server.
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runCheck() {
  try {
    const count = await detectBrokenPromises();
    if (count > 0) {
      console.log(`[scheduler] Broken-promise sweep: ${count} commitment(s) resumed.`);
    }
  } catch (err) {
    console.error('[scheduler] Broken-promise sweep failed:', err.message);
  }
}

// Starts the periodic sweep. Runs once immediately (so a broken promise
// from before the server was last restarted gets caught right away),
// then on CHECK_INTERVAL_MS after that for as long as the server is up.
function startPromiseScheduler() {
  runCheck();
  setInterval(runCheck, CHECK_INTERVAL_MS);
  console.log(`[scheduler] Promise-check scheduler started (every ${CHECK_INTERVAL_MS / 60000}m).`);
}

module.exports = { startPromiseScheduler };