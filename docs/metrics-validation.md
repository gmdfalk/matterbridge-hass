# Native metrics preview validation

Observed locally on 2026-10-24. Candidate plugin and companion core were built
from the working branches; no production HA instance or physical controller was used.

| Check                                                                                      | Result                                                                                             |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Plugin `npm run build`, `npm run typecheck`, `npm run lint`, scoped `npm run format:check` | Passed on local Node 22                                                                            |
| Plugin `npm run test:coverage`                                                             | 494 tests in 17 files passed; statements, branches, functions and lines all 100%                   |
| Core `npm run build`, `npm run typecheck`, scoped lint/format                              | Passed                                                                                             |
| Core grouped Matterbridge, Platform, PluginManager and native metrics tests                | 281 tests in 12 files passed                                                                       |
| Core coverage command                                                                      | Nonzero exit: pre-existing uncovered ANSI logging line; core lines 99.93% against a 100% threshold |
| Untouched core baseline, same Matterbridge test task                                       | Same nonzero coverage failure at baseline line 1801; 144 tests passed and core lines 99.93%        |
| `npm run test:metrics:docker -- ../matterbridge`                                           | Passed using the candidate core and plugin in Linux containers                                     |

The Docker test verified actual Prometheus `up=1`, plugin readiness, an acknowledged
HA event subscription, a matching application heartbeat, valid `promtool` exposition,
HA disconnect/recovery, secret-free output and absence of a listener when metrics
were disabled. It used an isolated IPv6-capable Docker network and synthetic HA
credentials, created one software helper, and cleaned up its containers/network.

The core baseline was exported from its untouched HEAD into a temporary directory;
no production code or coverage threshold was changed to bypass the failure. Both
baseline and candidate also emitted existing process signal-listener warnings.

The final local review added regressions for unsolicited/malformed application
pongs, stable node aliases after discovery reordering, concurrent failed startup
and repeated listener errors after startup. The pong and listener regressions
failed before their fixes. The listener test also verifies that its port can be
reused after failure. The smoke runner checks checkout identities before copying
sources and excludes common credential files from its temporary build context.

The existing nine-way OS/Node CI matrix has not been validated by these local runs.
The plugin's new typed diagnostics API depends on the companion core change; the
normal upstream-core CI job cannot validate it until that companion is available.
Keep the PR draft. It does not yet implement individual Matter report delivery
acknowledgements/deadlines, controller commissioning tests, experimental-backend
telemetry or Supervisor option forwarding. No live add-on deployment, HA config
check, hardware action, voice test or package publishing was performed.
