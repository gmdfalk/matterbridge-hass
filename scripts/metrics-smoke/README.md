# Local native metrics smoke test

The fixture runs the candidate Matterbridge core and HA plugin with a synthetic
HA WebSocket server. It registers one software helper and never contacts a real
Home Assistant instance. Use a disposable Docker network; do not use host networking,
production data volumes or real credentials. A second container runs Prometheus.

Run from the plugin checkout, with the companion core checkout as the argument:

```sh
npm run test:metrics:docker -- ../matterbridge
```

The runner stages only these two checkouts (excluding dependencies, Git/runtime
state and credentials), builds a Linux image, verifies Prometheus scraping and HA
disconnect/recovery, checks metrics-off behavior, then removes its containers and
network. The local review image remains cached. Initial dependencies may need
network access. Default test names/ports are dedicated to this check; a collision
fails rather than removing an existing container. No test invokes a device command
or pairs the software bridge to a controller. This is a scrape/HA-stream smoke test,
not validation of individual Matter subscription delivery.
