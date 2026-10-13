// Keep detached build/server process groups accounted for until they exit.
// Stopping a group waits for its port to close before a replacement starts.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

export function processHost(state, cwd) {
  const children = new Set();
  let closed = false;

  function start(name, command, args, env, workdir = cwd) {
    if (closed) throw new Error('pnpm try is stopping');

    const log = createWriteStream(join(state, `${name}.log`));
    const child = spawn(command, args, {
      cwd: workdir,
      detached: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    children.add(child);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        children.delete(child);
        log.end();
        resolve({ code, signal });
      });
    });

    // A server's spawn error is still reported when nobody awaits done yet.
    child.done.catch(() => {});

    return child;
  }

  async function stop(child) {
    if (!child || !children.has(child)) return;

    const signal = name => {
      try {
        process.kill(-child.pid, name);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };

    signal('SIGTERM');
    const timer = setTimeout(() => signal('SIGKILL'), 5_000);

    try {
      await child.done;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    start,
    stop,
    async capture(name, command, args, env, workdir) {
      const child = start(name, command, args, env, workdir);
      let out = '';
      let err = '';

      child.stdout.on('data', data => {
        out += data;
      });
      child.stderr.on('data', data => {
        err += data;
      });

      const { code } = await child.done;

      return { code: code ?? 1, out, err };
    },
    close() {
      closed = true;
      return Promise.all([...children].map(stop));
    },
    async step(label, command, args, env) {
      const name = label.replaceAll(' ', '-');

      process.stdout.write(`  ${label}… `);

      const { code } = await start(name, command, args, env).done;

      if (code !== 0) {
        console.log(`failed (see .try/${name}.log)`);
        throw new Error(`${label} failed`);
      }

      console.log('done');
    }
  };
}
