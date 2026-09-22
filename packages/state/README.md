# Player snapshots

`viewFor(world, playerId)` creates a detached player-facing snapshot.

Visibility uses Manhattan radius four around the player's base and living squads. Unseen enemy squads, guardians and resource nodes are omitted. The snapshot contains the player's resource balance, but not the rival's balance, either player's command sequence or rival movement destinations. The core location, opening timer, capture progress and winner are intentionally public.

`visibleCells` supports fog rendering. There is no explored-terrain memory yet. Geometry and bases are public; the training map is fixed and has no secret seed.

Snapshots must be sent only after the server associates a connection with its player identity. Filtering alone is not authentication.
