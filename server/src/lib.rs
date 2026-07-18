mod common;
mod firm_logic;
mod market_logic;
mod player_logic;
mod quest_logic;
mod rules;
mod sim_math;

use spacetimedb::{AnonymousViewContext, Identity, ReducerContext, ScheduleAt, Table, Timestamp};
use std::time::Duration;

use crate::common::{InputState, Vector3};

#[spacetimedb::table(accessor = player, public)]
#[derive(Clone)]
pub struct PlayerData {
    #[primary_key]
    identity: Identity,
    username: String,
    character_class: String,
    position: Vector3,
    rotation: Vector3,
    health: i32,
    max_health: i32,
    mana: i32,
    max_mana: i32,
    current_animation: String,
    is_moving: bool,
    is_running: bool,
    is_attacking: bool,
    is_casting: bool,
    last_input_seq: u32,
    input: InputState,
    color: String,
    cash_balance: f64,
    knowledge_level: u32,
    // Server-side wall-clock timestamp of the last accepted input, used to
    // measure real elapsed time between calls so movement speed can't be
    // inflated by sending faster than the intended ~20Hz (see `rules.rs`).
    last_input_at: Timestamp,
}

/// Per-identity anti-abuse guard for the market-moving reducers. Stores the
/// wall-clock micros of the caller's last shock/remix so a server-side cooldown
/// can reject stacking calls (see `rules::cooldown_elapsed`). Not public — it's
/// purely internal enforcement state.
#[spacetimedb::table(accessor = market_action_guard)]
#[derive(Clone)]
pub struct MarketActionGuard {
    #[primary_key]
    identity: Identity,
    last_shock_micros: i64,
    last_remix_micros: i64,
}

#[spacetimedb::table(accessor = logged_out_player)]
#[derive(Clone)]
pub struct LoggedOutPlayerData {
    #[primary_key]
    identity: Identity,
    username: String,
    character_class: String,
    position: Vector3,
    rotation: Vector3,
    health: i32,
    max_health: i32,
    mana: i32,
    max_mana: i32,
    last_seen: Timestamp,
    cash_balance: f64,
    knowledge_level: u32,
}

#[spacetimedb::table(accessor = game_tick_schedule, public, scheduled(game_tick))]
pub struct GameTickSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

#[spacetimedb::table(accessor = market_asset, public)]
#[derive(Clone)]
pub struct MarketAsset {
    #[primary_key]
    ticker: String,
    company_name: String,
    current_price: f64,
    previous_price: f64,
    volatility: f64,
    drift: f64,
}

/// Current market volatility regime (single row, id 0). Advanced once per
/// market tick by `process_market_tick` and read by clients so the active
/// regime (calm / volatile / crisis) can be displayed honestly. `regime` is a
/// `sim_math::Regime` encoded as u8.
#[spacetimedb::table(accessor = market_regime, public)]
#[derive(Clone)]
pub struct MarketRegime {
    #[primary_key]
    id: u32,
    regime: u8,
    ticks_in_regime: u32,
    updated_at: Timestamp,
}

/// AI-generated market news feed (server-authoritative so every client sees
/// the same headlines). Written by the `apply_market_shock` reducer.
#[spacetimedb::table(accessor = market_news, public)]
#[derive(Clone)]
pub struct MarketNews {
    #[primary_key]
    #[auto_inc]
    news_id: u64,
    headline: String,
    sentiment: i32,
    created_at: Timestamp,
}

#[spacetimedb::table(
    accessor = portfolio,
    public,
    index(accessor = by_owner, btree(columns = [owner_identity]))
)]
#[derive(Clone)]
pub struct Portfolio {
    #[primary_key]
    #[auto_inc]
    position_id: u64,
    owner_identity: Identity,
    ticker: String,
    shares: f64,
    average_entry_price: f64,
}

#[spacetimedb::table(accessor = market_tick_schedule, scheduled(process_market_tick))]
pub struct MarketTickSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

#[spacetimedb::table(accessor = vehicle_catalog, public)]
#[derive(Clone)]
pub struct VehicleCatalog {
    #[primary_key]
    vehicle_key: String,
    display_name: String,
    price: f64,
    model_url: String,
}

#[spacetimedb::table(
    accessor = owned_vehicle,
    public,
    index(accessor = by_owner, btree(columns = [owner_identity]))
)]
#[derive(Clone)]
pub struct OwnedVehicle {
    #[primary_key]
    #[auto_inc]
    vehicle_id: u64,
    owner_identity: Identity,
    vehicle_key: String,
    display_name: String,
    model_url: String,
    spawn_x: f32,
    spawn_z: f32,
}

#[spacetimedb::table(accessor = firm, public)]
#[derive(Clone)]
pub struct FirmData {
    #[primary_key]
    owner_identity: Identity,
    firm_name: String,
    tier: u32,
    reputation: f64,
    aum: f64,
    regulatory_risk: f64,
    total_profit: f64,
}

#[spacetimedb::table(
    accessor = employee,
    public,
    index(accessor = by_owner, btree(columns = [owner_identity]))
)]
#[derive(Clone)]
pub struct Employee {
    #[primary_key]
    #[auto_inc]
    employee_id: u64,
    owner_identity: Identity,
    role: String,
    name: String,
    salary_per_tick: f64,
    alpha_bonus: f64,
}

#[spacetimedb::table(accessor = property_catalog, public)]
#[derive(Clone)]
pub struct PropertyCatalog {
    #[primary_key]
    property_key: String,
    display_name: String,
    price: f64,
    property_type: String,
    firm_tier_required: u32,
    rent_per_tick: f64,
    reputation_bonus: f64,
}

#[spacetimedb::table(
    accessor = owned_property,
    public,
    index(accessor = by_owner, btree(columns = [owner_identity]))
)]
#[derive(Clone)]
pub struct OwnedProperty {
    #[primary_key]
    #[auto_inc]
    property_id: u64,
    owner_identity: Identity,
    property_key: String,
    display_name: String,
    property_type: String,
}

/// Tracks which career objectives a player has already claimed, so rewards can
/// only be granted once. The condition for each quest is re-validated
/// server-side in `quest_logic::claim_quest_reward` before payout.
#[spacetimedb::table(
    accessor = completed_quest,
    public,
    index(accessor = by_owner, btree(columns = [owner_identity]))
)]
#[derive(Clone)]
pub struct CompletedQuest {
    #[primary_key]
    #[auto_inc]
    record_id: u64,
    owner_identity: Identity,
    quest_key: String,
    claimed_at: Timestamp,
}

/// Server-computed leaderboard. The game tick reducer ranks every player by
/// net worth (cash + live portfolio value) and writes the top 5 here. Rank is
/// the primary key (1 = richest), so it is an indexed lookup the view can read.
#[spacetimedb::table(accessor = rich_list, public)]
#[derive(Clone)]
pub struct RichListEntry {
    #[primary_key]
    rank: u32,
    identity: Identity,
    username: String,
    firm_name: String,
    net_worth: f64,
    tier: u32,
}

/// Public, read-only view returning the global top-5 "Rich List".
///
/// Views may not use `.iter()` — only indexed lookups — so we read the
/// pre-ranked `rich_list` rows by their primary key (rank 1..=5). The ranking
/// itself is computed in the `game_tick` reducer, which is allowed to iterate.
#[spacetimedb::view(accessor = rich_list_view, public)]
fn rich_list_view(ctx: &AnonymousViewContext) -> Vec<RichListEntry> {
    let mut out = Vec::new();
    for rank in 1u32..=5 {
        if let Some(entry) = ctx.db.rich_list().rank().find(rank) {
            out.push(entry);
        }
    }
    out
}

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) -> Result<(), String> {
    spacetimedb::log::info!("[INIT] Initializing QuantLink financial metropolis...");

    if ctx.db.game_tick_schedule().count() == 0 {
        ctx.db.game_tick_schedule().insert(GameTickSchedule {
            scheduled_id: 0,
            scheduled_at: ScheduleAt::Interval(Duration::from_secs(1).into()),
        });
    }

    market_logic::seed_market_assets(ctx);
    market_logic::seed_vehicle_catalog(ctx);
    market_logic::seed_market_regime(ctx);
    firm_logic::seed_property_catalog(ctx);
    market_logic::schedule_market_tick(ctx);

    Ok(())
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    spacetimedb::log::info!("Trader connected: {}", ctx.sender());
    market_logic::seed_market_assets(ctx);
    market_logic::seed_vehicle_catalog(ctx);
    market_logic::repair_market_prices(ctx);
    firm_logic::seed_property_catalog(ctx);

    if let Some(player) = ctx.db.player().identity().find(ctx.sender()) {
        firm_logic::ensure_firm(ctx, ctx.sender(), &player.username);
    }
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    let player_identity = ctx.sender();
    let logout_time = ctx.timestamp;

    if let Some(player) = ctx.db.player().identity().find(player_identity) {
        let logged_out_player = LoggedOutPlayerData {
            identity: player.identity,
            username: player.username.clone(),
            character_class: player.character_class.clone(),
            position: player.position.clone(),
            rotation: player.rotation.clone(),
            health: player.health,
            max_health: player.max_health,
            mana: player.mana,
            max_mana: player.max_mana,
            last_seen: logout_time,
            cash_balance: player.cash_balance,
            knowledge_level: player.knowledge_level,
        };
        ctx.db.logged_out_player().insert(logged_out_player);
        ctx.db.player().identity().delete(player_identity);
    } else if let Some(mut logged_out_player) = ctx
        .db
        .logged_out_player()
        .identity()
        .find(player_identity)
    {
        logged_out_player.last_seen = logout_time;
        ctx.db.logged_out_player().identity().update(logged_out_player);
    }
}

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String, character_class: String) {
    let player_identity = ctx.sender();

    if ctx.db.player().identity().find(player_identity).is_some() {
        return;
    }

    let player_count = ctx.db.player().iter().count();
    let colors = ["cyan", "magenta", "yellow", "lightgreen", "white", "orange"];
    // Derive the colour from the identity (stable per player) rather than join
    // order, which could hand two connected players the same colour after churn.
    let color_hash = rules::hash_bytes(&player_identity.to_byte_array());
    let assigned_color = colors[rules::index_from_hash(color_hash, colors.len())].to_string();
    let spawn_position = Vector3 {
        x: (player_count as f32 * 4.0) - 2.0,
        y: 1.0,
        z: 8.0,
    };

    let default_input = InputState {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jump: false,
        attack: false,
        cast_spell: false,
        sequence: 0,
    };

    if let Some(logged_out_player) = ctx
        .db
        .logged_out_player()
        .identity()
        .find(player_identity)
    {
        let rejoining_player = PlayerData {
            identity: logged_out_player.identity,
            username: logged_out_player.username.clone(),
            character_class: logged_out_player.character_class.clone(),
            position: spawn_position,
            rotation: logged_out_player.rotation.clone(),
            health: logged_out_player.health,
            max_health: logged_out_player.max_health,
            mana: logged_out_player.mana,
            max_mana: logged_out_player.max_mana,
            current_animation: "idle".to_string(),
            is_moving: false,
            is_running: false,
            is_attacking: false,
            is_casting: false,
            last_input_seq: 0,
            input: default_input,
            color: assigned_color,
            cash_balance: logged_out_player.cash_balance,
            knowledge_level: logged_out_player.knowledge_level,
            last_input_at: ctx.timestamp,
        };
        ctx.db.player().insert(rejoining_player);
        firm_logic::ensure_firm(ctx, player_identity, &logged_out_player.username);
        ctx.db.logged_out_player().identity().delete(player_identity);
    } else {
        let firm_name = username.clone();
        ctx.db.player().insert(PlayerData {
            identity: player_identity,
            username,
            character_class,
            position: spawn_position,
            rotation: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            health: 100,
            max_health: 100,
            mana: 100,
            max_mana: 100,
            current_animation: "idle".to_string(),
            is_moving: false,
            is_running: false,
            is_attacking: false,
            is_casting: false,
            last_input_seq: 0,
            input: default_input,
            color: assigned_color,
            cash_balance: market_logic::default_cash(),
            knowledge_level: 0,
            last_input_at: ctx.timestamp,
        });
        firm_logic::ensure_firm(ctx, player_identity, &firm_name);
    }
}

#[spacetimedb::reducer]
pub fn update_player_input(
    ctx: &ReducerContext,
    input: InputState,
    _client_pos: Vector3,
    client_rot: Vector3,
    client_animation: String,
) {
    if let Some(mut player) = ctx.db.player().identity().find(ctx.sender()) {
        // Measure real elapsed time since this player's last accepted input and
        // clamp it to a safe movement dt. This is the anti-speed-hack: a client
        // spamming faster than 20Hz gets a proportionally tiny dt per call
        // instead of a fixed 1/20s, so it can't outrun honest clients.
        let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
        let last_micros = player.last_input_at.to_micros_since_unix_epoch();
        let elapsed_secs = (now_micros - last_micros) as f64 / 1_000_000.0;
        let dt = rules::clamp_input_dt(elapsed_secs, rules::INPUT_TICK_SECONDS) as f32;

        player_logic::update_input_state(&mut player, input, client_rot, client_animation, dt);
        player.last_input_at = ctx.timestamp;
        ctx.db.player().identity().update(player);
    }
}

#[spacetimedb::reducer(update)]
pub fn game_tick(ctx: &ReducerContext, _tick_info: GameTickSchedule) {
    // Players are updated directly by the `update_player_input` reducer, so the
    // periodic tick only advances the economy (firm cashflow + leaderboard).
    firm_logic::process_firm_tick(ctx);
    firm_logic::update_rich_list(ctx);
}

#[spacetimedb::reducer(update)]
pub fn process_market_tick(ctx: &ReducerContext, tick_info: MarketTickSchedule) {
    let seed = tick_info.scheduled_id.wrapping_mul(0xDEAD_BEEF);
    market_logic::process_market_tick(ctx, seed);
}

#[spacetimedb::reducer]
pub fn execute_trade(
    ctx: &ReducerContext,
    ticker: String,
    shares: f64,
    is_buy: bool,
) -> Result<(), String> {
    if is_buy {
        market_logic::execute_buy(ctx, ticker, shares)
    } else {
        market_logic::execute_sell(ctx, ticker, shares)
    }
}

#[spacetimedb::reducer]
pub fn buy_vehicle(ctx: &ReducerContext, vehicle_key: String) -> Result<(), String> {
    market_logic::buy_vehicle(ctx, vehicle_key)
}

#[spacetimedb::reducer]
pub fn upgrade_knowledge_level(ctx: &ReducerContext) -> Result<(), String> {
    market_logic::upgrade_knowledge(ctx)
}

#[spacetimedb::reducer]
pub fn hire_employee(ctx: &ReducerContext, role: String) -> Result<(), String> {
    firm_logic::hire_employee(ctx, role)
}

#[spacetimedb::reducer]
pub fn buy_property(ctx: &ReducerContext, property_key: String) -> Result<(), String> {
    firm_logic::buy_property(ctx, property_key)
}

#[spacetimedb::reducer]
pub fn upgrade_firm(ctx: &ReducerContext) -> Result<(), String> {
    firm_logic::upgrade_firm(ctx)
}

/// Claim the cash reward for a completed career objective. The server
/// re-validates that the objective is actually met and that it has not been
/// claimed before, so the reward is fully authoritative.
#[spacetimedb::reducer]
pub fn claim_quest_reward(ctx: &ReducerContext, quest_key: String) -> Result<(), String> {
    quest_logic::claim_quest_reward(ctx, quest_key)
}

/// Read the caller's market-action guard row (last shock/remix micros),
/// defaulting to the "never acted" sentinel (0) if none exists yet.
fn market_guard_for(ctx: &ReducerContext, identity: Identity) -> MarketActionGuard {
    ctx.db
        .market_action_guard()
        .identity()
        .find(identity)
        .unwrap_or(MarketActionGuard {
            identity,
            last_shock_micros: 0,
            last_remix_micros: 0,
        })
}

/// Persist an updated guard row (insert-or-update).
fn save_market_guard(ctx: &ReducerContext, guard: MarketActionGuard) {
    if ctx
        .db
        .market_action_guard()
        .identity()
        .find(guard.identity)
        .is_some()
    {
        ctx.db.market_action_guard().identity().update(guard);
    } else {
        ctx.db.market_action_guard().insert(guard);
    }
}

/// Apply an AI-generated market event. `sentiment` ranges from -10 (crash) to
/// +10 (rally). The event is recorded to the public `market_news` feed and
/// instantly jolts every asset's price + volatility so all connected traders
/// must react in real time.
///
/// Rate-limited per identity (`rules::SHOCK_COOLDOWN_MICROS`): the reducer is
/// callable directly over the wire by any client, so without a server-side
/// cooldown a single misbehaving client could stack the clamped-per-call jolt
/// to move the market arbitrarily far in seconds.
#[spacetimedb::reducer]
pub fn apply_market_shock(
    ctx: &ReducerContext,
    headline: String,
    sentiment: i32,
) -> Result<(), String> {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let mut guard = market_guard_for(ctx, ctx.sender());
    if !rules::cooldown_elapsed(guard.last_shock_micros, now, rules::SHOCK_COOLDOWN_MICROS) {
        return Err("Market shock on cooldown — slow down".to_string());
    }

    market_logic::apply_market_shock(ctx, headline, sentiment);

    guard.last_shock_micros = now;
    save_market_guard(ctx, guard);
    Ok(())
}

/// Prompt-to-game "Remix" engine. The client AI parses a player's prompt into
/// structured market parameters and calls this to mutate the live simulation,
/// which SpacetimeDB broadcasts to every connected trader.
///
/// Rate-limited per identity (`rules::REMIX_COOLDOWN_MICROS`), same rationale as
/// `apply_market_shock`. Also surfaces an error when the ticker matches no asset
/// so the client can tell the player instead of the call silently no-op'ing.
#[spacetimedb::reducer]
pub fn remix_market(
    ctx: &ReducerContext,
    ticker: String,
    drift_modifier: f64,
    volatility_modifier: f64,
    headline: String,
) -> Result<(), String> {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let mut guard = market_guard_for(ctx, ctx.sender());
    if !rules::cooldown_elapsed(guard.last_remix_micros, now, rules::REMIX_COOLDOWN_MICROS) {
        return Err("Remix on cooldown — slow down".to_string());
    }

    market_logic::remix_market(ctx, ticker, drift_modifier, volatility_modifier, headline)?;

    guard.last_remix_micros = now;
    save_market_guard(ctx, guard);
    Ok(())
}
