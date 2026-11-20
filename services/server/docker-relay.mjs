#!/usr/bin/env node
// `docker` for Nod on Railway. Nod runs its tools with `docker exec -i --user U [--workdir W] CONTAINER CMD...`
// against two sibling containers. Railway has no Docker, so the workspace and the browser are separate
// services, and this command forwards the exec to the relay in the right one over the private network.
// It speaks only that one form of `docker exec`; anything else fails the way an unknown command does.
//
// Wire format, after a JSON header line from here; frames are [type:1][length:4 BE][payload]:
//   here -> relay: 1 stdin bytes, 2 end of stdin. The connection closing means this command is gone,
//                  and the relay then kills what it started (as docker does when its client dies).
//   relay -> here: 1 stdout, 2 stderr, 3 exit code (int32 BE), 4 error text.
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

const fail = (message, code = 125) => {
  process.stderr.write(`docker (Railway relay): ${message}\n`);
  process.exit(code);
};

const args = process.argv.slice(2);
if (args[0] !== 'exec') fail(`only "docker exec" is available here, not "${args[0] ?? ''}"`);
let i = 1;
let user = null;
let workdir = null;
for (; i < args.length; i++) {
  const a = args[i];
  if (a === '-i' || a === '--interactive') continue;
  if (a === '--user' || a === '-u') user = args[++i];
  else if (a.startsWith('--user=')) user = a.slice(7);
  else if (a === '--workdir' || a === '-w') workdir = args[++i];
  else if (a.startsWith('--workdir=')) workdir = a.slice(10);
  else if (a.startsWith('-')) fail(`unsupported option ${a}`);
  else break;
}
const container = args[i];
const command = args.slice(i + 1);
if (!container || !command.length) fail('usage: docker exec -i --user U [--workdir W] CONTAINER COMMAND...');

let config;
try {
  config = JSON.parse(readFileSync(join(process.env.DOCKER_CONFIG || '/nonexistent', 'nod-relay.json'), 'utf8'));
} catch {
  fail('the relay configuration is missing (DOCKER_CONFIG/nod-relay.json)');
}
const role = /^nod-workspace(?:-[A-Za-z0-9_-]+)?$/.test(container)
  ? 'workspace'
  : /^nod-browser(?:-[A-Za-z0-9_-]+)?$/.test(container)
    ? 'browser'
    : null;
if (!role) fail(`No such container: ${container}`, 1);
const target = config[role];
const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(target || '');
if (!match) fail(`no address for the ${role} service`);

const frame = (type, payload) => {
  const head = Buffer.alloc(5);
  head[0] = type;
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
};
const socket = net.connect({ host: match[1], port: Number(match[2]) });
socket.setNoDelay(true);
let exited = false;
let buffer = Buffer.alloc(0);

socket.on('connect', () => {
  socket.write(JSON.stringify({ v: 1, token: config.token, role, user, workdir, command }) + '\n');
  process.stdin.on('data', (chunk) => {
    if (!socket.write(frame(1, chunk))) process.stdin.pause();
  });
  socket.on('drain', () => process.stdin.resume());
  const eof = () => socket.write(frame(2, Buffer.alloc(0)));
  process.stdin.on('end', eof);
  process.stdin.on('error', eof);
});

const writeOut = (stream, payload) => {
  if (!stream.write(payload)) {
    socket.pause();
    stream.once('drain', () => socket.resume());
  }
};

socket.on('data', (chunk) => {
  buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
  while (buffer.length >= 5) {
    const type = buffer[0];
    const length = buffer.readUInt32BE(1);
    if (buffer.length < 5 + length) break;
    const payload = buffer.subarray(5, 5 + length);
    buffer = buffer.subarray(5 + length);
    if (type === 1) writeOut(process.stdout, payload);
    else if (type === 2) writeOut(process.stderr, payload);
    else if (type === 3) {
      exited = true;
      const code = payload.readInt32BE(0);
      process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
    } else if (type === 4) {
      exited = true;
      fail(payload.toString('utf8'), 126);
    }
  }
});

socket.on('error', (error) => {
  if (!exited) fail(`cannot reach the ${role} service (${error.code || error.message})`);
});
socket.on('close', () => {
  if (!exited) fail(`the ${role} service closed the connection`, 255);
});
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    socket.destroy();
    process.exit(128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 })[signal]);
  });
}
