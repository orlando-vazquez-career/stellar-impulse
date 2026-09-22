# Deterministic training simulation

This package implements an initial **single-sector training scenario**, not the full campaign described in the product plan.

- 12 by 12 empty logical grid, symmetric under reflection through the main diagonal.
- Two players (`p1`, `p2`), one Interceptor squad each.
- A guarded Metal node at (3, 3), a guarded core at (6, 6).
- A pure 10 Hz tick. Positions, health, damage and progress use integers.
- One orthogonal movement step every three ticks. This initial arena has no obstacles; movement resolves the x axis before the y axis.
- Automatic attacks within Manhattan distance one, once per second. All damage resolves simultaneously. Stable entity IDs break target ties.
- Guardians stay at their objective. The core guardian is protected until the core opens.
- Capturing a Metal node takes 30 uncontested ticks after its guardian dies. It then generates one Metal per second. Production, repairs and fleet rebuilding are future work.
- Training core opens at tick 200 (20 seconds), then requires 80 uncontested ticks (8 seconds), after the guardian dies.
- Both teams present: capture progress freezes. Absent players lose one progress tick per uncontested tick.
- Core capture closes the training scenario. No campaign fragment, on-chain reward, settlement or transaction is produced.

`MVP_CANDIDATE_RULES` separately records the proposed 1,800 tick opening and 400 tick capture from the design brief. They are not used by the initial training client and are not validated balance values.

## API

`createWorld()` returns a fresh `World`.

`applyCommand(world, playerId, rawCommand)` validates the untrusted command and returns either `{ accepted: true, world }` or `{ accepted: false, reason, world }`. Accepted commands return a new state. Invalid ownership, coordinates, stale/duplicate sequences and destroyed units are rejected. Rejected commands do not consume a sequence. Commands use positive safe-integer sequences per player; sessions must retain their latest sequence.

`stepWorld(world)` returns the next state without modifying its argument. The caller provides the clock. After a winner exists, ticks become no-ops.

Use `viewFor(world, playerId)` from `@impulso/state` before sending a snapshot to a player. Never serialize the full server state into a multiplayer response. The local training client may hold the full state for its bot; this is not a competitive security boundary.

The package imports only command definitions and validation. It does not import rendering, networking, wallet, blockchain or inventory code.
