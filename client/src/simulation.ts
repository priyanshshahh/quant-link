/**
 * 10-Player Simulation Test
 *
 * Spawns 10 SpacetimeDB clients that connect, register as players,
 * and randomly walk around for 10 seconds.
 *
 * Usage:
 *   cd client && npm run simulate          # default 10 bots
 *   cd client && npm run simulate -- 100   # 100 bots
 *
 * Requires a running SpacetimeDB server with the module published. Host and
 * database name come from the same env vars the web client uses, so all three
 * (client, load-test bots, deploy script) stay coherent. Defaults match the
 * local-dev values in client/.env.example.
 */

import { DbConnection } from './generated/index.js';
import type { ErrorContext } from './generated/index.js';
import type { InputState, Vector3 } from './generated/types.js';

// --- Configuration ---
// tsx/Node runs this (not Vite), so read plain env vars, falling back to the
// VITE_-prefixed ones and finally the local-dev defaults.
const DB_HOST =
  process.env.SPACETIME_HOST ?? process.env.VITE_SPACETIME_HOST ?? '127.0.0.1:3001';
const DB_NAME =
  process.env.SPACETIME_DB ?? process.env.VITE_SPACETIME_DB ?? 'quant-link';
const NUM_CLIENTS = parseInt(process.argv[2] || '10', 10);
const SIMULATION_DURATION_MS = parseInt(process.argv[3] || '10', 10) * 1000;
const INPUT_TICK_INTERVAL_MS = 50; // 20Hz

const CHARACTER_CLASSES = ['Wizard', 'Paladin'];
type DirectionKey = 'forward' | 'backward' | 'left' | 'right';
const DIRECTIONS: DirectionKey[] = ['forward', 'backward', 'left', 'right'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Client State ---
interface ClientState {
  id: number;
  conn: DbConnection;
  registered: boolean;
  sequence: number;
  tickHandle: ReturnType<typeof setInterval> | null;
  direction: DirectionKey;
  dirChangeCountdown: number;
  rotation: number; // Y-axis rotation in radians
}

function buildInput(dir: DirectionKey, seq: number): InputState {
  return {
    forward: dir === 'forward',
    backward: dir === 'backward',
    left: dir === 'left',
    right: dir === 'right',
    sprint: Math.random() < 0.3, // 30% chance of sprinting
    jump: false,
    attack: false,
    castSpell: false,
    sequence: seq,
  };
}

function animationFromInput(input: InputState): string {
  const { forward, backward, left, right, sprint } = input;
  if (!forward && !backward && !left && !right) return 'idle';
  const prefix = sprint ? 'run' : 'walk';
  if (forward) return `${prefix}-forward`;
  if (backward) return `${prefix}-back`;
  if (left) return `${prefix}-left`;
  return `${prefix}-right`;
}

function tickClient(state: ClientState): void {
  if (!state.conn || !state.registered) return;

  // Change direction periodically
  state.dirChangeCountdown--;
  if (state.dirChangeCountdown <= 0) {
    state.direction = randomItem(DIRECTIONS);
    state.dirChangeCountdown = 5 + Math.floor(Math.random() * 20);
    // Rotate bot to face movement direction
    const rotMap: Record<DirectionKey, number> = {
      forward: 0,
      backward: Math.PI,
      left: Math.PI / 2,
      right: -Math.PI / 2,
    };
    state.rotation = rotMap[state.direction] + (Math.random() - 0.5) * 0.5;
  }

  state.sequence += 1;
  const input = buildInput(state.direction, state.sequence);
  const clientPos: Vector3 = { x: 0, y: 0, z: 0 };
  const clientRot: Vector3 = { x: 0, y: state.rotation, z: 0 };
  const clientAnimation = animationFromInput(input);

  state.conn.reducers.updatePlayerInput({
    input,
    clientPos,
    clientRot,
    clientAnimation,
  });
}

function spawnClient(clientId: number): Promise<ClientState> {
  return new Promise((resolve, reject) => {
    const username = `Bot_${clientId}`;
    const characterClass = randomItem(CHARACTER_CLASSES);
    const timeout = setTimeout(() => reject(new Error(`Client ${clientId} timed out`)), 15_000);

    const state: Partial<ClientState> = {
      id: clientId,
      registered: false,
      sequence: 0,
      tickHandle: null,
      direction: randomItem(DIRECTIONS),
      dirChangeCountdown: 3 + Math.floor(Math.random() * 10),
      rotation: 0,
    };

    const onConnect = (connection: DbConnection) => {
      state.conn = connection;

      // Register callbacks before subscribing
      connection.db.player.onInsert(() => {});

      connection
        .subscriptionBuilder()
        .onApplied(() => {
          console.log(`  [Bot ${clientId}] Subscribed. Registering as "${username}" (${characterClass})...`);
          connection.reducers.registerPlayer({ username, characterClass });
          state.registered = true;

          state.tickHandle = setInterval(() => {
            tickClient(state as ClientState);
          }, INPUT_TICK_INTERVAL_MS);

          clearTimeout(timeout);
          resolve(state as ClientState);
        })
        .onError((err: any) => {
          clearTimeout(timeout);
          reject(err);
        })
        .subscribe('SELECT * FROM player');
    };

    const onDisconnect = (_ctx: ErrorContext, reason?: Error | null) => {
      console.log(`  [Bot ${clientId}] Disconnected: ${reason?.message ?? 'unknown'}`);
      if (state.tickHandle) {
        clearInterval(state.tickHandle);
        state.tickHandle = null;
      }
    };

    const dbUri = DB_HOST.startsWith('ws')
      ? DB_HOST
      : DB_HOST.includes('spacetimedb.com')
        ? `wss://${DB_HOST.replace(/^https?:\/\//, '')}`
        : `ws://${DB_HOST.replace(/^https?:\/\//, '')}`;

    DbConnection.builder()
      .withUri(dbUri)
      .withDatabaseName(DB_NAME)
      .withConfirmedReads(false)
      .onConnect(onConnect)
      .onDisconnect(onDisconnect)
      .build();
  });
}

// --- Main ---
async function main() {
  console.log(`\n=== SpacetimeDB Simulation: ${NUM_CLIENTS} bots for ${SIMULATION_DURATION_MS / 1000}s ===\n`);

  // Spawn all clients concurrently
  console.log('Connecting clients...');
  const results = await Promise.allSettled(
    Array.from({ length: NUM_CLIENTS }, (_, i) => spawnClient(i + 1))
  );

  const clients: ClientState[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') clients.push(r.value);
    else console.error('  Failed:', r.reason);
  }

  console.log(`\n${clients.length}/${NUM_CLIENTS} bots connected and walking.\n`);

  if (clients.length === 0) {
    console.error('No clients connected. Is the server running?');
    process.exit(1);
  }

  // Print periodic status
  const statusInterval = setInterval(() => {
    const dirs = clients.map(c => `Bot${c.id}:${c.direction}`).join(' ');
    console.log(`  [Status] ${dirs}`);
  }, 2000);

  // Let simulation run
  await new Promise<void>(resolve => setTimeout(resolve, SIMULATION_DURATION_MS));

  // Clean up
  clearInterval(statusInterval);
  console.log('\nStopping all bots...');
  for (const client of clients) {
    if (client.tickHandle) {
      clearInterval(client.tickHandle);
      client.tickHandle = null;
    }
  }

  console.log('Simulation complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
