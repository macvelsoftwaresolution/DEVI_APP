// Captures real DEVI app screens (Flutter web build + demo data) via Edge DevTools Protocol.
// usage: node shoot.mjs <outDir> <scene:file> ...
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [outDir, ...jobs] = process.argv.slice(2);
const PORT = 9333;
const profile = join(tmpdir(), 'devi-cdp-profile');
rmSync(profile, { recursive: true, force: true });

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {}
}
if (!target) { console.error('Edge did not start'); edge.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });

for (const job of jobs) {
  const [scene, file] = job.split(':');
  await send('Page.navigate', { url: `http://127.0.0.1:8765/preset.html?s=${scene}` });
  await sleep(14000); // splash (2s) + CanvasKit + fonts
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, file), Buffer.from(shot.result.data, 'base64'));
  console.log('saved', file);
}
ws.close();
edge.kill();
process.exit(0);
