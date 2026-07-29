import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readText = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const [powerShellServer, pythonServer, desktopLauncher, startBat, macStart] = await Promise.all([
  readText('server.ps1'),
  readText('server.py'),
  readText('packaging/xiangxu_launcher.py'),
  readText('start.bat'),
  readText('packaging/macos/start.command')
]);

for (const [name, source] of [
  ['PowerShell server', powerShellServer],
  ['Python server', pythonServer],
  ['desktop launcher', desktopLauncher]
]) {
  assert.match(source, /\.mjs['"]?\s*[:=]\s*['"]text\/javascript|'\.mjs'\s*=\s*'text\/javascript/, `${name} 必须以 JavaScript MIME 返回 .mjs`);
  assert.match(source, /\.wasm['"]?\s*[:=]\s*['"]application\/wasm|'\.wasm'\s*=\s*'application\/wasm/, `${name} 必须以 application/wasm 返回 WASM`);
}

assert.match(startBat, /server\.py.+--port 5173/, 'Windows Python 启动路径必须使用带 MIME 映射的 server.py');
assert.match(macStart, /server\.py --port/, 'macOS 启动路径必须使用带 MIME 映射的 server.py');
assert.doesNotMatch(desktopLauncher, /self\.window\b/, '桌面 API 不得公开 pywebview Window，否则 JS API 扫描会递归卡死');
assert.match(desktopLauncher, /self\._window\b/, '桌面 API 应仅通过私有属性保存窗口引用');
assert.match(desktopLauncher, /def _attach\(/, '桌面窗口绑定方法不得暴露给 JavaScript');

console.log('local runtime MIME mapping tests passed');
