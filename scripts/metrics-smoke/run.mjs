/**
 * @file scripts/metrics-smoke/run.mjs
 * @description Builds disposable candidate containers and verifies actual Prometheus scraping.
 * @author Max Falk
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const core = path.resolve(process.argv[2] ?? '../matterbridge');
const plugin = process.cwd();
const staging = await mkdtemp(path.join(tmpdir(), 'matterbridge-native-metrics-'));
const suffix = `${process.pid}`;
const network = `mb-metrics-${suffix}`;
const bridge = `mb-metrics-bridge-${suffix}`;
const disabled = `mb-metrics-disabled-${suffix}`;
const prometheus = `mb-metrics-prometheus-${suffix}`;
const image = 'codex/matterbridge-metrics:review';
const created = [];
let networkCreated = false;

async function docker(...args) {
  const { stdout } = await exec('docker', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}
async function start(name, args) {
  await docker('run', '-d', '--name', name, '--network', network, ...args);
  created.push(name);
}
async function url(name, port) {
  const binding = await docker('port', name, `${port}/tcp`);
  return `http://${binding}`;
}
async function waitFor(check, description, timeout = 90000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await check()) return; } catch { /* A process may still be starting. */ }
    await pause(500);
  }
  throw new Error(`Timed out: ${description}`);
}
const excluded = new Set(['.git', '.npmrc', '.netrc', '.ssh', '.git-credentials', '.matterbridge', '.mattercert', 'node_modules', '.cache', 'dist', 'coverage', 'temp', 'tmp', 'chip', 'certificates', 'secrets', 'secrets.yaml', 'secrets.yml', 'secrets.json', '.storage']);
const filter = (source) => {
  const name = path.basename(source);
  return !excluded.has(name) && !name.startsWith('.env') && !name.endsWith('.tsbuildinfo');
};
try {
  assert.equal(JSON.parse(await readFile(path.join(core, 'package.json'), 'utf8')).name, 'matterbridge', 'Expected a Matterbridge core checkout');
  assert.equal(JSON.parse(await readFile(path.join(plugin, 'package.json'), 'utf8')).name, 'matterbridge-hass', 'Run from the plugin checkout');
  await cp(core, path.join(staging, 'core'), { recursive: true, filter });
  await cp(plugin, path.join(staging, 'plugin'), { recursive: true, filter });
  console.log('Building isolated candidate core and plugin with the repository npm scripts...');
  await docker('build', '-f', path.join(staging, 'plugin/scripts/metrics-smoke/Dockerfile'), '-t', image, staging);
  await docker('network', 'create', '--ipv6', network);
  networkCreated = true;
  await start(bridge, ['-e', 'METRICS_ENABLED=true', '-p', '127.0.0.1::9490', image]);
  const endpoint = `${await url(bridge, 9490)}/metrics`;
  const metrics = async () => {
    const response = await fetch(endpoint);
    assert.equal(response.status, 200);
    return response.text();
  };
  const value = (text, name, expected) => text.includes(`${name}{plugin="matterbridge-hass"} ${expected}\n`);
  await waitFor(async () => value(await metrics(), 'matterbridge_plugin_ready', 1), 'plugin readiness');
  await waitFor(async () => /matterbridge_plugin_last_heartbeat_timestamp_seconds\{[^}]+\} [1-9]/.test(await metrics()), 'application heartbeat');
  const metricText = await metrics();
  assert(value(metricText, 'matterbridge_plugin_subscription_established', 1));
  assert(metricText.includes('matterbridge_subscription_delivery_supported 0'));
  for (const forbidden of ['synthetic-test-only', 'access_token', 'qrPairingCode', 'manualPairingCode', 'input_boolean.metrics_fixture']) assert(!metricText.includes(forbidden));
  const metricFile = path.join(staging, 'metrics.prom');
  await writeFile(metricFile, metricText);
  // promtool reads the metrics from stdin, not from a filename argument.
  await docker('run', '--rm', '-v', `${metricFile}:/tmp/metrics.prom:ro`, '--entrypoint', '/bin/sh', 'prom/prometheus:v3.14.0', '-c', 'promtool check metrics < /tmp/metrics.prom');
  const config = path.join(staging, 'prometheus.yml');
  await writeFile(config, `global:\n  scrape_interval: 1s\nscrape_configs:\n  - job_name: native-metrics-smoke\n    static_configs:\n      - targets: ["${bridge}:9490"]\n`);
  await start(prometheus, ['-p', '127.0.0.1::9090', '-v', `${config}:/etc/prometheus/prometheus.yml:ro`, 'prom/prometheus:v3.14.0']);
  const api = await url(prometheus, 9090);
  const query = async (expression) => {
    const response = await fetch(`${api}/api/v1/query?${new URLSearchParams({ query: expression })}`);
    const body = await response.json();
    return body.data.result;
  };
  await waitFor(async () => (await query('up{job="native-metrics-smoke"}')).some((r) => r.value[1] === '1'), 'Prometheus up=1');
  await waitFor(async () => (await query('matterbridge_plugin_subscription_established')).some((r) => r.value[1] === '1'), 'Prometheus HA subscription series');
  await docker('exec', bridge, 'node', '--input-type=module', '-e', "await fetch('http://127.0.0.1:8123/disconnect',{method:'POST'})");
  await waitFor(async () => {
    const text = await metrics();
    return value(text, 'matterbridge_plugin_connected', 0) && value(text, 'matterbridge_plugin_subscription_established', 0);
  }, 'HA disconnect observation');
  await docker('exec', bridge, 'node', '--input-type=module', '-e', "await fetch('http://127.0.0.1:8123/recover',{method:'POST'})");
  await waitFor(async () => value(await metrics(), 'matterbridge_plugin_subscription_established', 1), 'HA reconnect and subscription recovery');
  await start(disabled, ['-e', 'METRICS_ENABLED=false', image]);
  await waitFor(async () => (await docker('logs', disabled)).includes('Configured plugin'), 'disabled plugin readiness');
  await docker('exec', disabled, 'node', '--input-type=module', '-e', "import fs from 'node:fs/promises'; const c=JSON.parse(await fs.readFile('/data/.matterbridge/matterbridge-hass.config.json')); if(c.metrics_enabled!==false)process.exit(1)");
  await docker('exec', disabled, 'node', '--input-type=module', '-e', "let absent=false; try{await fetch('http://127.0.0.1:9490/metrics')}catch{absent=true} if(!absent)process.exit(1)");
  console.log('PASS: plugin ready, heartbeat, promtool, Prometheus up=1, HA disconnect/recovery, secret-free metrics and disabled listener.');
} finally {
  for (const name of created.reverse()) {
    await docker('stop', '--time', '10', name).catch(() => {});
    await docker('rm', name).catch(() => {});
  }
  if (networkCreated) await docker('network', 'rm', network).catch(() => {});
  await rm(staging, { recursive: true, force: true });
}
