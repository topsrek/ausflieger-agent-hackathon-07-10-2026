# Heartbeat checklist (Ausflieger)

Fallback for missed webhook triggers. Keep it cheap.

1. Run `ausflieger jobs requeue-stale --minutes 20` (jobs stuck in `running` after a crash go back to the queue).
2. Run `ausflieger jobs next`.
   - `{"claimed":false,"job":null}`: nothing to do. Reply `NO_REPLY` (older versions: `HEARTBEAT_OK`).
   - A job: process it with the `ausflieger-research` skill, then repeat step 2 until no job is left.
