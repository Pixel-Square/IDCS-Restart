#!/usr/bin/env node
/**
 * Cross-platform post-build step.
 *
 * On the Linux deployment host the build output is copied to
 * /home/iqac2/IDCS-Restart/frontend/build/ via rsync.
 *
 * On Windows (and any machine without rsync) the copy is skipped so that
 * `npm run build` exits successfully instead of failing on Unix-only syntax.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const source = path.join(__dirname, '..', 'build');
const destination = '/home/iqac2/IDCS-Restart/frontend/build/';

if (!fs.existsSync(source)) {
  console.error(`[postbuild] Build directory not found: ${source}`);
  process.exit(1);
}

if (process.platform === 'win32') {
  console.log(`[postbuild] Windows detected — build output is ready at ${source}`);
  process.exit(0);
}

const probe = spawnSync('rsync', ['--version'], { stdio: 'ignore' });
if (probe.error || probe.status !== 0) {
  console.log('[postbuild] rsync is not available — skipping remote build sync.');
  process.exit(0);
}

console.log(`[postbuild] Syncing ${source}/ -> ${destination}`);
const result = spawnSync('rsync', ['-a', '--delete', `${source}/`, destination], {
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
