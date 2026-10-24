# Native metrics implementation plan and review

Topic: `matterbridge-native-prometheus`. This PR starts the native feature; it
is not the final implementation of individual Matter subscription delivery health.
There is no existing OpenSpec change in this upstream repository.

## Repository guidance reviewed

- `AGENTS.md`, `STYLEGUIDE.md`, `CONTRIBUTING.md`, `README.md`, `.agents/README.md`.
- Shared testing, endpoint, plugin-frontend and CHIP-test instructions under
  `.agents/rules/`; the other agent directories are pointers, not additional sources.
- `.github/commit-message-instructions.md`, CI build workflow, `package.json`,
  `.vscode/tasks.json`, TypeScript and Vitest configuration.
- For the core companion: its agent/style/contribution/testing guidance and
  `README-DEV.md`, including the requirement to link one core/matter.js installation
  rather than add Matterbridge or matter.js as plugin dependencies.

Use the fork's `main` as the plugin review base: this fork has no `dev` branch.
The companion is based on the matching core `main` release for local validation;
retarget to the maintainer's development branch when preparing an upstream submission.
The user requested review in their fork. Keep this review there; before proposing
this larger feature upstream, follow the contribution guide's issue-first scope
process. Search existing issues/PRs before submission. Do not post private configs.
Explicit user instructions to implement and raise a PR authorize the branch/commit/
push operations needed for that review despite the repository's default local git
restrictions. No package publishing, live-home deployment or pairing changes.

## Final design review

Keep the listener in core so plugin import/constructor/start failures remain
observable. Let the plugin supply a small typed, read-only upstream-connection
snapshot. Use the existing HTTP module, logger, configuration loading and test
helpers; no private core access from the plugin, extra exporter process, custom
Prometheus serializer or protocol monkey patch. Add metrics configuration only as
optional fields, default false, preserving old installations.

Dependency review changed the original proposed client: npm marks `prom-client`
as deprecated in favor of `@prometheus-io/client`. Use the maintained successor,
pinned to 0.16.1 in the core lockfile (compatible with the current supported Node
22/24/26 versions). Its Apache-2.0 license and transitive dependencies are checked
as part of dependency review. The plugin adds no dependency on Matterbridge,
matter.js or the metrics client. Use an isolated registry and lazy-load it only
when enabled. Reuse the existing fake clocks, `getFreePort` and software HA tests.

Keep TypeScript/ESM conventions, public JSDoc, source/test headers, small functions,
explicit cleanup, narrow diffs and no unrelated formatting/dependency upgrades.
Use only npm scripts or repository tasks for build/typecheck/lint/format/tests.
Run the complete grouped Module and Home Assistant tasks, not selected test cases.
Core changes also need the complete Matterbridge, Platform and PluginManager groups.
Record baseline failures separately. Add human-readable setup, metric semantics,
limits and disable/rollback instructions, and a Dev-branch changelog entry without
bumping release versions. Use conventional commits and a focused PR description.

## Milestones and acceptance

1. Native opt-in core endpoint, plugin lifecycle/export counts, HA connection and
   acknowledged current-generation event subscription, separate application heartbeat,
   Matter nodes/fabrics and active subscription counts. Bind/config/collection failures
   must remain isolated from control. No metrics-specific resources while disabled.
2. Supported SDK subscription inventory and report completion/failure/deadline hooks.
   First establish what successful initial, chunked, data and keepalive exchanges mean.
   A private internal send promise can resolve without delivery or after peer rejection;
   do not use it as an acknowledgement signal. No private-field access or log parsing.
3. Bounded opaque per-subscription detail and negotiated-interval health, protocol
   integration tests, worker freshness/capabilities, optional authenticated serving and
   official/extra add-on option forwarding with unique metrics ports.
4. Candidate-only direct Prometheus scrapes, missing/unknown-series rules and startup
   grace. Compare to any existing monitoring before removing overlaps. Then stage one
   instance at a time with protected persistent-data backup, identity comparison and
   a verified compatible rollback release set. No production rollout in this PR.

The current PR implements milestone 1. It reports delivery support as zero and
explicitly declines the experimental backend. Milestones 2-4 remain required before
claiming complete subscription health or production rollout acceptance.

## Validation

Tests cover absent/false defaults, application-vs-transport heartbeat, stale subscribe
acknowledgements, disconnect/recovery, lifecycle failure, metrics bind errors, collection
failure/unknowns, stale-series removal, current controller aggregation, concurrent
scrapes and secret-free output. Run normal build/typecheck/lint/format requirements.
The Docker fixture runs an actual candidate bridge and plugin with a synthetic HA
server, then a real Prometheus scrape. Verify `up=1`, HA ready/subscribed, heartbeat,
HA disconnect/recovery and default-off behavior. Keep fixture networking isolated and
stop its containers afterward. It does not commission a physical controller, certify
Matter conformance or test voice commands. Full CHIP conformance is relevant if a
later milestone changes protocol behavior; use the existing harness and its cleanup.

Full acceptance still requires individual subscriptions and verified report health,
not just a passing scrape. Do not relax repository gates to make the PR green.
