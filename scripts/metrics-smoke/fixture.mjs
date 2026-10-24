/**
 * @file scripts/metrics-smoke/fixture.mjs
 * @description Runs an isolated synthetic HA server and the candidate bridge for local scraping.
 * @author Max Falk
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/disconnect') {
    isAvailable = false;
    for (const client of websocket.clients) client.close();
    response.end('disconnected');
  } else if (request.method === 'POST' && request.url === '/recover') {
    isAvailable = true;
    response.end('recovered');
  } else response.writeHead(404).end();
});
const websocket = new WebSocketServer({ server });
let isAvailable = true;
websocket.on('connection', (socket) => {
  if (!isAvailable) { socket.close(); return; }
  socket.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
  socket.on('message', (data) => {
    const request = JSON.parse(data.toString());
    if (request.type === 'auth') {
      socket.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
      return;
    }
    if (request.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', id: request.id }));
      return;
    }
    const entity = { id: 'synthetic-switch', entity_id: 'input_boolean.metrics_fixture', name: 'Metrics Fixture', device_id: null, area_id: null, labels: [], disabled_by: null, hidden_by: null, translation_key: null, original_name: 'Metrics Fixture' };
    const state = { entity_id: entity.entity_id, state: 'off', attributes: { friendly_name: 'Metrics Fixture' }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), context: { id: 'fixture', parent_id: null, user_id: null } };
    const responses = {
      get_config: { state: 'RUNNING', unit_system: { temperature: '°C' }, version: '2026.10.0' },
      get_services: {},
      get_states: [state],
      'config/device_registry/list': [],
      'config/entity_registry/list': [entity],
      'config/area_registry/list': [],
      'config/label_registry/list': [],
    };
    socket.send(JSON.stringify({ type: 'result', id: request.id, success: true, result: responses[request.type] ?? null }));
  });
});
await new Promise((resolve) => server.listen(8123, '127.0.0.1', resolve));

const args = ['/work/core/bin/matterbridge.js', '--homedir', '/data', '--frontend', '0', '--novirtual'];
const add = spawn(process.execPath, [...args, '--add', '/work/plugin'], { stdio: 'inherit' });
const code = await new Promise((resolve) => add.once('exit', resolve));
if (code !== 0) throw new Error('Could not register the local candidate plugin');
await mkdir('/data/.matterbridge', { recursive: true });
const config = JSON.parse(await readFile('/work/plugin/matterbridge-hass.config.json', 'utf8'));
Object.assign(config, { host: 'ws://127.0.0.1:8123', token: 'synthetic-test-only', filterByArea: '', filterByLabel: '', metrics_enabled: process.env.METRICS_ENABLED === 'true', metrics_bind: '0.0.0.0', metrics_port: 9490, reconnectTimeout: 30, reconnectRetries: 10, enableServerRvc: false });
await writeFile('/data/.matterbridge/matterbridge-hass.config.json', JSON.stringify(config));
const bridge = spawn(process.execPath, args, { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { bridge.kill(signal); });
bridge.once('exit', (exitCode) => { server.close(); websocket.close(); process.exit(exitCode ?? 1); });
