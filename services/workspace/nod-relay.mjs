// Relay for Nod on Railway: runs the commands Nod's server would run with `docker exec` in this
// container. Listens on the private network, accepts only the shared token, and allows only the exact
// users, folders and commands upstream's runtime proxy allows (deployment/self-host/docker-proxy.mjs).
// Runs as root so it can start each command as the user Nod asks for, as `docker exec --user` does.
import { spawn } from 'node:child_process';
import { chownSync, existsSync, mkdirSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import net from 'node:net';

const log = (line) => process.stderr.write(`nod-relay: ${line}\n`);
const role = process.env.NOD_RELAY_ROLE;
const port = Number(process.env.NOD_RELAY_PORT || 7070);
const token = process.env.NOD_RELAY_TOKEN || '';
if (role !== 'workspace' && role !== 'browser') {
  log(`NOD_RELAY_ROLE must be workspace or browser, not "${role}"`);
  process.exit(1);
}
// The token reaches only this process: commands get a clean environment.
delete process.env.NOD_RELAY_TOKEN;
const locked = token.length < 32;
if (locked) log('NOD_RELAY_TOKEN is missing or shorter than 32 characters: every command is refused until it is set.');
const digest = (value) => createHash('sha256').update(String(value)).digest();
const expected = digest(token);

// What `docker exec` would give: the image's environment, never the Railway service variables.
const KEEP = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_VERSION', 'YARN_VERSION', 'NPM_CONFIG_PREFIX', 'PIPX_HOME', 'PIPX_BIN_DIR'];
const baseEnv = Object.fromEntries(KEEP.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : [])));
const defaultWorkdir = role === 'workspace' ? '/workspace' : '/app';

function allowed(request) {
  const { user, workdir, command } = request;
  if (!Array.isArray(command) || !command.length || command.some((p) => typeof p !== 'string' || p.includes('\0')))
    return null;
  if (role === 'browser') {
    if (user !== 'node' || (workdir ?? '') !== '' || JSON.stringify(command) !== '["node","/app/bridge.mjs"]') return null;
    return { uid: 1000, gid: 1000, home: '/home/node', cwd: defaultWorkdir };
  }
  if (user === 'node') {
    if (workdir !== '/var/tmp' && !/^\/workspace\/[0-9a-f-]{36}$/.test(workdir || '')) return null;
    return { uid: 1000, gid: 1000, home: '/home/node', cwd: workdir };
  }
  const numeric = /^([2-5]\d{4}):(1002)$/.exec(user || '');
  if (!numeric || workdir !== '/var/tmp') return null;
  return { uid: Number(numeric[1]), gid: 1002, home: '/', cwd: workdir };
}

function frame(type, payload) {
  const head = Buffer.alloc(5);
  head[0] = type;
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  let header = Buffer.alloc(0);
  let child = null;
  let finished = false;
  const timer = setTimeout(() => socket.destroy(), 10_000);
  const refuse = (message) => {
    finished = true;
    socket.end(frame(4, Buffer.from(message)));
  };
  const onHeader = (chunk) => {
    header = Buffer.concat([header, chunk]);
    const newline = header.indexOf(10);
    if (newline < 0) {
      if (header.length > 65_536) socket.destroy();
      return;
    }
    socket.off('data', onHeader);
    clearTimeout(timer);
    const rest = header.subarray(newline + 1);
    let request;
    try {
      request = JSON.parse(header.subarray(0, newline).toString('utf8'));
    } catch {
      return refuse('Invalid request.');
    }
    if (locked || !timingSafeEqual(digest(request.token), expected)) return refuse('Runtime operation refused.');
    if (request.role !== role) return refuse('Runtime operation refused.');
    const run = allowed(request);
    if (!run) return refuse('Runtime operation refused.');
    // Upstream's server creates each thread's folder on a volume it shares with the workspace; here
    // the workspace has its own volume, so the folder is made on first use, as the server would.
    if (role === 'workspace' && run.cwd.startsWith('/workspace/') && !existsSync(run.cwd)) {
      try {
        mkdirSync(run.cwd, { mode: 0o700 });
        chownSync(run.cwd, 1000, 1000);
      } catch (error) {
        return refuse(`Cannot create ${run.cwd}: ${error.code || error.message}`);
      }
    }
    try {
      child = spawn(request.command[0], request.command.slice(1), {
        cwd: run.cwd,
        env: { ...baseEnv, HOME: run.home },
        uid: run.uid,
        gid: run.gid,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      return refuse(`Cannot start the command: ${error.message}`);
    }
    child.on('error', (error) => {
      if (!finished) refuse(`Cannot start the command: ${error.code || error.message}`);
    });
    child.stdout.on('data', (d) => socket.write(frame(1, d)) || child.stdout.pause());
    child.stderr.on('data', (d) => socket.write(frame(2, d)) || child.stderr.pause());
    socket.on('drain', () => {
      child.stdout.resume();
      child.stderr.resume();
    });
    child.stdin.on('error', () => {});
    // Frames from the caller: 1 stdin bytes, 2 end of stdin.
    let input = Buffer.alloc(0);
    const onInput = (chunk) => {
      input = input.length ? Buffer.concat([input, chunk]) : chunk;
      while (input.length >= 5) {
        const length = input.readUInt32BE(1);
        if (input.length < 5 + length) break;
        if (input[0] === 1) child.stdin.write(input.subarray(5, 5 + length));
        else if (input[0] === 2) child.stdin.end();
        input = input.subarray(5 + length);
      }
    };
    if (rest.length) onInput(rest);
    socket.on('data', onInput);
    const started = Date.now();
    child.on('close', (code, signal) => {
      // One line per command (user, program and result; never its arguments or data).
      log(`exec as ${request.user} ${request.command[0]} -> ${signal || code} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (finished) return;
      finished = true;
      const exit = Buffer.alloc(4);
      exit.writeInt32BE(code ?? 128 + (signal ? ({ SIGKILL: 9, SIGTERM: 15, SIGINT: 2, SIGHUP: 1 })[signal] || 1 : 1));
      socket.end(frame(3, exit));
    });
  };
  socket.on('data', onHeader);
  socket.on('error', () => {});
  // The caller went away (Nod stopped the command, or its server restarted): stop the whole process
  // group, as docker does when its client dies.
  const gone = () => {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }
  };
  socket.on('end', gone);
  socket.on('close', gone);
});
server.on('error', (error) => {
  log(`cannot listen on port ${port}: ${error.message}`);
  process.exit(1);
});
server.listen({ host: '::', port, ipv6Only: false }, () => log(`${role} relay listening on port ${port}`));
