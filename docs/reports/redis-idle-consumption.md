# Redis idle consumption — 2026-09-05

## Cause

`pnpm dev` starts Medusa in `shared` mode. Installed Medusa 2.18.0 creates
four BullMQ 5.13.0 workers: event delivery, workflow retries/timeouts,
scheduled jobs, and workflow execution cleanup. An empty application therefore
still uses Redis. This is separate from the previously fixed notification job
that ran up to 20 workflows against an empty outbox.

BullMQ defaults to a five-second blocking wait (`drainDelay`) for empty queues
and a 30-second stalled-job check. Its empty-queue Lua script also performs
internal Redis operations. The cleaner has a repeatable 30-minute job; queues
with delayed jobs cap their blocking wait at ten seconds in this installed
version, independently of `drainDelay`.

Sources inspected: installed event-bus-redis `services/event-bus-redis.js`,
workflow-engine-redis `loaders/redis.js` and
`utils/workflow-orchestrator-storage.js`, BullMQ `classes/worker.js` and
`commands/moveToActive-11.lua`.

## Change

`packages/api/medusa-config.ts` now sets `workerOptions.drainDelay = 60` on
the event bus and `redis.workerOptions.drainDelay = 60` on the workflow engine.
These are supported module options, not modifications to installed packages.
New queue markers wake the blocking worker immediately; this is not a
60-second delay before processing newly queued work.

Lock renewal, stalled-job recovery, retries, scheduled tasks, and durable
Redis storage remain enabled. Delayed queues and reliability checks retain
their native behavior, so this mitigation does not eliminate idle consumption.

## Verification and limits

- API health returned 200; buyer login/profile/onboarding read and admin
  login/application-list read passed after the change.
- Email was disabled only in the test child process. No orders, application
  approvals, or test emails were created; test processes were stopped.
- Earlier short sample: technical `INFO stats` counter delta 64 over 15 seconds.
- After change: six ten-second deltas `1, 0, 16, 11, 0, 0` (28 over 60 seconds).
- These short samples are indicative only, not a controlled long-term benchmark
  or an estimate of billed commands. INFO counters also differed between
  connections/runs; their reset/scope behavior was not established. Do not add
  them into a monthly usage figure. No per-command breakdown was returned by
  `INFO commandstats` on this service. Upstash Console usage is authoritative
  for the quota; it was not available to this diagnostic.
- 174 API unit tests passed, including three configuration regression cases;
  API typecheck, lint, and build passed (five existing native inventory import warnings).

## Development guidance

Normal `pnpm dev` still supports background processing. Run one instance and
stop it after testing. This adjustment does not guarantee that a 500,000-command
monthly allowance supports continuous operation. Upstash itself documents
[idle BullMQ traffic and command-based plan concerns](https://upstash.com/docs/redis/integrations/bullmq).

For unrestricted local development, use a dedicated persistent local Redis or
a Redis service sized for continuously running workers. A local Redis setup
has not been installed/configured by this change. Do not silently switch to
in-memory workflows or disable workers: that would make asynchronous feature
tests incomplete and change durability. No old Redis tasks were replayed.
