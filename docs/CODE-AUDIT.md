# QuantLink — Code Audit

Honest, no-fix audit. Findings are ranked by **value-to-fix** (impact of the
issue × cheapness of the fix), not by severity alone. This is a solo-built
hackathon-to-production project — most findings reflect normal "get it
working first" tradeoffs, not incompetence. Nothing here has been changed;
this is a map for prioritizing future work.

## Ranked findings

### 1. Market-moving reducers (`apply_market_shock`, `remix_market`) are callable directly by any client, unauthenticated, with no server-side call-frequency limit

**Where**: `server/src/lib.rs` reducers `apply_market_shock` / `remix_market`
→ `market_logic.rs`.

The module is published `--anonymous` (per `CLAUDE.md`/dev commands), so any
process that can open a WebSocket and speak the SpacetimeDB protocol — not
just the shipped React client — can call these reducers with hand-crafted
arguments. The reducers do clamp the *magnitude* of each call thoroughly
(`drift_modifier` → [-0.5, 0.5], `volatility_modifier` → [-0.5, 0.8], price
jolt → ±25%, resulting `drift`/`volatility` re-clamped after applying,
`sentiment` clamped [-10, 10]), but there is **no limit on call frequency**.
The only rate limiting in the whole system (`api/_lib/ratelimit.ts`, 6-10
req/min per IP) sits in front of the *optional* `/api/remix` Gemini proxy —
a client can skip that proxy entirely and call `remixMarket`/`applyMarketShock`
straight from generated bindings as fast as the connection allows, repeatedly
stacking the clamped-per-call jolt to move the market arbitrarily far in
seconds. This is the most consequential input-validation gap in the reducer
set precisely because it's the one place the game's core promise ("every
trader sees the same authoritative market") is directly attackable by a
single misbehaving client.
**Fix cost**: low-medium — add a per-identity cooldown/counter table (same
pattern already used for the news feed's 12-row cap) checked at the top of
both reducers.

### 2. `update_player_input` assumes a fixed 20Hz cadence with no server-measured elapsed time or call-rate enforcement — a straightforward speed-hack vector

**Where**: `server/src/player_logic.rs::update_input_state` /
`calculate_new_position`; called from `server/src/lib.rs::update_player_input`.

`delta_time_estimate` is a hardcoded `1.0 / 20.0`, not derived from
`ctx.timestamp` deltas between calls. The reducer has no guard against being
invoked more often than the intended 20Hz — a modified client (or the load
bots in `simulation.ts`, which already call it on their own `setInterval`)
calling it at, say, 200Hz would move a player 10× the intended speed, since
each call independently advances position by `speed * (1/20)`. This is
distinct from finding #1 in mechanism (no clamp exists at all here vs. a
clamp-but-no-frequency-limit) and is cheaper to exploit since movement has no
clamp whatsoever on magnitude either.
**Fix cost**: low — compute real `dt` from `ctx.timestamp` minus the player's
last-updated timestamp (would need a new column), clamp it to a sane max
(e.g. 1/10s), and optionally reject calls faster than ~40Hz outright.

### 3. Zero automated tests outside `sim_math.rs`

**Where**: whole repo.

The 13 unit tests in `server/src/sim_math.rs` are excellent and cover exactly
the right thing (the pure GBM/RNG/firm math), but every reducer's
*validation logic* — the `execute_buy`/`execute_sell` funds/shares checks,
`hire_employee` headcount and role-string validation, `buy_property` tier
gating, `claim_quest_reward`'s 10 condition branches, `upgrade_firm`'s
net-worth/cash gates — has no test coverage at all. On the client, there are
**no test files anywhere** (`find` for `*.test.*`/`*.spec.*` returns nothing,
and `package.json` defines no test script). The riskiest code in the repo —
client-side prediction/reconciliation in `Player.tsx`, the 20Hz send-loop
change-detection in `App.tsx` — is exactly the code with the least safety
net. CI (`ci.yml`) only runs `cargo test --lib` (the same 13 tests) plus a
type-check/build; it does not exercise reducer behavior or client logic.
**Fix cost**: medium — `spacetimedb-cli`'s reducer testing patterns
(`.agents/skills/spacetimedb-reducers/`) already vendored in-repo for
reference; a first pass over `execute_buy`/`execute_sell`/`claim_quest_reward`
would cover the highest-value gaps cheaply.

### 4. Per-player, per-mount FBX model + animation loading with no cache — a genuine multiplayer scaling hazard

**Where**: `client/src/components/Player.tsx` (`useEffect` model-loading block,
`loadAnimations`).

Every `<Player>` instance — one per row in the `player` table, i.e. one per
*other* connected trader, not just the local player — independently
constructs its own `FBXLoader`, loads the full character model, then
sequentially `fetch()`s and loads **14 separate animation FBX files** with no
shared cache (no `useFBX`/`useLoader` from drei, no `THREE.Cache`, no
module-level memoization keyed by `characterClass`). For a 2-character-class
game this means N concurrently visible players cost `15 × N` FBX parses and
GPU uploads instead of 15 × (number of distinct classes actually in the
scene). This directly undercuts the "multiplayer" pitch: the more players
join, the worse each client's load time and memory footprint gets, purely
from redundant asset loading rather than actual scene complexity.
**Fix cost**: medium — memoize per-`characterClass` model+animation loading
in a module-level cache (or drei's `useGLTF.preload`-style pattern, adapted
for FBX), share `AnimationClip`s across `AnimationMixer` instances.

### 5. `FinancialCity` renders ~450 individually-authored, non-instanced meshes plus ~11 real-time point lights and `frames={Infinity}` contact shadows

**Where**: `client/src/components/FinancialCity.tsx`, `GameScene.tsx`.

The procedural skyline (60 blocks) + 10 named landmark buildings each expand
to 4 meshes (box body, HDR-emissive edge `lineSegments`, roofline box, window
band box) = ~280 meshes; 13 cars expand to 8 meshes each (body, cabin, 4
wheels, 2 lights) = ~104; 12 palm trees expand to 8 meshes each (trunk + 7
frond cones) = ~96. None of this repetitive geometry uses
`THREE.InstancedMesh` / drei's `<Instances>`, despite buildings/cars/palms
each sharing only a handful of distinct dimensions — an easy instancing win
that's currently left on the table. On top of the raw mesh count: 8 street
lamps each add a real, always-on `pointLight` (no distance-based culling
beyond Three's own falloff), plus 2 landmark point lights and one at the
Exchange entrance (~11 dynamic lights total in a forward-lit scene), a
2048×2048-shadow-mapped directional light with `SoftShadows` (16 samples),
`ContactShadows` re-rendering every single frame (`frames={Infinity}` at
1024 resolution), and a full `EffectComposer` (Bloom w/ `mipmapBlur` +
Vignette + ACES tone mapping) at `multisampling={4}`. Individually each choice
is reasonable for a moody neon-noir look; stacked together with zero
instancing this is the kind of scene that will show its cost first on
lower-end GPUs and mobile, which a "multiplayer 3D life-sim" pitch implies as
an audience.
**Fix cost**: medium — instancing is the highest-leverage single change here;
lights/shadows/post-processing are visual-identity decisions that would need
explicit product buy-in to change.

### 6. Dead code beyond the documented `unreal/SimWorld/`

**Where**: `client/src/main.ts`; `styles` object in
`client/src/components/DebugPanel.tsx`.

- `client/src/main.ts` is never imported by anything — `client/index.html`
  loads `/src/main.tsx` directly — yet it still exists, prints one
  `console.log`, and carries a comment implying it might matter
  ("functionality is in App.tsx which is rendered via main.tsx"). Confirmed
  via full-repo grep: no reference to `main.ts` outside itself.
- `DebugPanel.tsx` defines a `styles: { [key: string]: React.CSSProperties }`
  object (lines ~244-265) that is **never read** — the component exclusively
  uses ad-hoc inline `style={{ ... }}` objects instead. Confirmed via grep
  (`styles.` has zero matches in the component body).

Neither is harmful at runtime, but both are the kind of leftover that
confuses a new contributor into thinking they're load-bearing.
**Fix cost**: trivial — delete both.

### 7. Gameplay-balance constants triplicated across Rust and two separate TS components

**Where**: firm tiers — `server/src/firm_logic.rs::TIERS` vs.
`client/src/components/TradingTerminal.tsx::TIER_NAMES/TIER_REQS/TIER_COSTS`
vs. `client/src/components/PlayerUI.tsx::TIER_NAMES`; quest catalog —
`server/src/quest_logic.rs::QUESTS` (keys + reward amounts) vs.
`client/src/components/QuestLog.tsx` (`quests: QuestDef[]` — titles,
descriptions, reward amounts, and progress *targets*, independently
hand-typed).

None of this is a correctness bug today (the server is authoritative and
re-validates everything — see `quest_condition_met`), but it is a silent
drift hazard: bumping a quest reward or a firm-tier cost in Rust does nothing
to the UI's displayed reward/progress numbers unless a human remembers to
touch three files in two languages. `TIER_NAMES` alone is duplicated
verbatim in two different client components rather than shared from one
module.
**Fix cost**: low — export the catalogs as generated/shared constants (or at
minimum consolidate the two client-side `TIER_NAMES` copies into one shared
module).

### 8. `Player.tsx` is a 1,169-line god-component mixing five concerns

**Where**: `client/src/components/Player.tsx`.

One component owns: FBX model + 14-animation loading/lifecycle, an animation
finite-state-machine, client-side movement prediction + server
reconciliation, **two independent camera systems** (follow-cam and
orbital-cam, with their own zoom/damping/rotation state), and debug-arrow
visualization. This is the largest and most stateful file in the client by a
wide margin (next largest is `App.tsx` at 877 lines) and — per finding #3 —
has zero test coverage. It's individually understandable (well-commented)
but any future change to, say, camera behavior risks touching movement
prediction code in the same file by accident.
**Fix cost**: medium-high — splitting camera logic and animation loading into
separate hooks would reduce blast radius, but is a real refactor, not a
quick win; document-only scope here, not recommending it be done casually.

### 9. Heavy, unconditional `console.log`/`console.warn`/`console.error` usage left in production paths

**Where**: `client/src/components/Player.tsx` (60 call sites),
`client/src/App.tsx` (25 call sites), plus scattered calls elsewhere
(`DebugPanel.tsx`'s model-check feature, `simulation.ts`).

Much of this is per-frame or per-animation-load logging (e.g. "Loading
animation X from Y" for 14 files × every player mount), which will flood the
browser console in any session with more than a couple of connected players,
with real (if small) runtime cost from string interpolation on every call
even when devtools are closed. `Player.tsx` in particular logs on every
orbital-camera movement calculation frame when in that mode. None of this is
gated behind a debug flag or `import.meta.env.DEV` check.
**Fix cost**: low — gate behind a debug flag or strip via a build-time
babel/esbuild plugin; not urgent, but easy.

### 10. Minor reducer/logic honesty gaps worth knowing about (not urgent)

- **`register_player` spawn color** is assigned by `player_count % colors.len()`
  (`server/src/lib.rs`), not derived from identity — after enough join/leave
  churn, two simultaneously-connected players can be assigned the same color,
  which is cosmetic but slightly undermines "each trader is visually
  distinct."
- **`remix_market` with an unrecognized ticker** silently becomes a no-op
  affecting zero market rows (client-side `TICKERS` validation in
  `api/remix.ts` prevents this from the proxy path, but a direct reducer
  call with a garbage ticker string just does nothing) rather than returning
  an `Err` — the reducer's return type is `()`, not `Result<(), String>`, so
  there's no channel to report this even if it wanted to.
- **`upgrade_knowledge_level`** has no cash cost in the reducer despite the
  in-game framing of it being a purchasable upgrade path elsewhere in the UI
  copy — confirm intended design (free knowledge vs. paid) since the code
  currently just checks the level cap.

These are small, individually low-impact items grouped together because none
justifies its own investigation, but a careful reviewer should know they
exist.

## What's *not* a problem (worth stating for contrast)

- No `.unwrap()`/`.expect()`/`panic!` anywhere in `server/src/*.rs` — every
  fallible lookup goes through `.ok_or(...)` → `Result<(), String>`, which is
  good discipline for a WASM module where a panic can be costlier to recover
  from than in a native process.
- `sim_math.rs` is genuinely dependency-free and genuinely unit-tested
  against the exact production code path (not a parallel copy) — a real
  strength worth preserving as the codebase grows.
- The Gemini-key-never-in-browser boundary is correctly enforced and was
  actually verified by grepping a real production build
  (`docs/PROJECT-NOTES.md`), not just asserted in a comment.
