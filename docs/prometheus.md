# Prometheus metrics

Native metrics are disabled by default. This preview requires the companion
Matterbridge core change; the released core does not serve this endpoint yet.
Installing only this plugin change keeps HA control working and logs a warning
if you enable metrics on an unsupported core.

## Enable metrics

In the plugin configuration, set:

```json
{
  "metrics_enabled": true,
  "metrics_bind": "127.0.0.1",
  "metrics_port": 9490
}
```

Restart Matterbridge after changing these options. Omitting `metrics_enabled`
or setting it to `false` leaves metrics off: no listener, metrics registry,
telemetry timer or extra HA subscription is created. To disable it again, set
it to false and restart Matterbridge. Do not uninstall the plugin or reset pairings.

The bind must be an IP address. Loopback allows scraping from the same host;
a remote Prometheus needs an explicit reachable private bind. The preview has
no built-in metrics authentication: restrict access at the network boundary and
do not expose the port publicly. The metrics listener serves no administration API.
Each process needs a different free port, especially with host-networked HA add-ons.
All enabled plugins in one process must use the same bind/port. These are plugin
settings, not new Supervisor add-on options in this preview.

A minimal scrape job for Prometheus on the same host is:

```yaml
scrape_configs:
  - job_name: matterbridge
    scrape_interval: 30s
    static_configs:
      - targets: ['127.0.0.1:9490']
```

For Prometheus in another container, loopback refers to that container, so use
an explicitly configured container-network address instead.

## Understand the signals

| Metric                                                         | Meaning                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `up`                                                           | Prometheus's own scrape result; says whether the metrics endpoint is reachable                |
| `matterbridge_collection_success`                              | Whether the current scrape could observe local runtime state                                  |
| `matterbridge_last_observation_timestamp_seconds`              | Time of the most recent successful runtime observation                                        |
| `matterbridge_uptime_seconds`                                  | Matterbridge process uptime                                                                   |
| `matterbridge_plugin_ready{plugin}`                            | Plugin enabled, loaded, started and configured without a lifecycle error                      |
| `matterbridge_exports_registered{plugin}`                      | Registered export count; compare against explicit expectations                                |
| `matterbridge_plugin_connection_supported{plugin}`             | Whether that plugin supplies upstream connection diagnostics                                  |
| `matterbridge_plugin_connected{plugin}`                        | For this plugin, HA WebSocket authenticated                                                   |
| `matterbridge_plugin_subscription_established{plugin}`         | HA event subscription acknowledged on the current connection generation                       |
| `matterbridge_plugin_last_heartbeat_timestamp_seconds{plugin}` | Last matching HA application pong, in Unix seconds; zero before one arrives                   |
| `matterbridge_node_online{node}`                               | Matter root, childbridge or standalone node online                                            |
| `matterbridge_fabric_present{node,controller}`                 | Fabric currently registered, even if it has no active connection                              |
| `matterbridge_controller_info{node,controller,vendor}`         | Vendor name for a fabric alias                                                                |
| `matterbridge_active_sessions{node,controller}`                | Active peer sessions for a fabric                                                             |
| `matterbridge_active_subscriptions{node,controller}`           | Sum of subscriptions across those active sessions                                             |
| `matterbridge_subscription_delivery_supported`                 | **Zero in this preview:** individual report acknowledgements/deadlines are not observable yet |

A paired controller with zero subscriptions is different from a removed fabric.
A controller can rotate sessions; inspect the aggregate rather than requiring every
session to subscribe. Keep expected nodes/controllers outside discovery so removed
series cannot silently remove an alert. Fabric aliases use the local fabric index;
re-pairing can change them. Node aliases distinguish root, plugin and standalone
nodes; review expectations if node ownership/order changes.

HA connection diagnostics do not require new network probes. They observe the
existing connection and its application pings. A transport pong alone does not
refresh the heartbeat. Disconnect clears heartbeat freshness; a delayed subscribe
acknowledgement from a previous connection cannot make the current one healthy.

On collection failure, current state series are omitted and collection success is
zero; the last successful observation timestamp is retained. Unsupported connection
metrics are omitted with a support flag of zero. Never interpret either as a healthy
empty inventory. A plugin failure does not stop the core-owned metrics listener.

## Preview limits and troubleshooting

This is the first implementation milestone, not the complete subscription-health
feature. Individual subscription inventory, report outcomes/deadlines, additional
processing counters, worker/experimental-backend diagnostics, optional authentication,
and Supervisor option forwarding remain planned. The experimental backend explicitly
declines metrics; it must not publish an empty healthy inventory. Session counts do
not prove controller cloud/voice availability or physical device operation.

If scraping fails, check that both candidate changes are installed, metrics are
enabled, the bind/port is valid and free, and Prometheus can reach that address.
Listener startup failures log a warning and leave household control running. If
`up=1` but `collection_success=0`, investigate diagnostics rather than accepting old
values. If the plugin is ready but its HA connection/subscription is down, investigate
the HA path. Give normal startup and controller reconnection a bounded grace period.

No metrics contain HA tokens, configuration objects, entity inventories, pairing
codes, serial numbers or raw fabric/peer IDs. Avoid attaching full bridge logs to
issues because the normal runtime logs can contain pairing credentials.

See [the implementation plan](native-metrics-plan.md) and
[the Docker smoke test](../scripts/metrics-smoke/README.md) for verification.
