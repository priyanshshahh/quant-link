/**
 * Vibe Coding Starter Pack: 3D Multiplayer - App.tsx
 *
 * Main application component that orchestrates the entire multiplayer experience.
 * This file serves as the central hub for:
 *
 * 1. SpacetimeDB Connection Management:
 *    - Establishes and maintains WebSocket connection
 *    - Handles authentication and identity
 *    - Subscribes to database tables
 *    - Processes real-time updates
 *
 * 2. Player Input Handling:
 *    - Keyboard and mouse event listeners
 *    - Input state tracking and normalization
 *    - Animation state determination
 *    - Camera/rotation management with pointer lock
 *
 * 3. Game Loop:
 *    - Sends player input to server at appropriate intervals
 *    - Updates local state based on server responses
 *    - Manages the requestAnimationFrame cycle
 *
 * 4. UI Management:
 *    - Renders GameScene (3D view)
 *    - Controls DebugPanel visibility
 *    - Manages JoinGameDialog for player registration
 *    - Displays connection status
 *
 * Extension points:
 *    - Add new input types in currentInputRef and InputState
 *    - Extend determineAnimation for new animation states
 *    - Add new reducers calls for game features (see handleCastSpellInput)
 *    - Modify game loop timing or prediction logic
 *
 * Related files:
 *    - components/GameScene.tsx: 3D rendering with Three.js
 *    - components/Player.tsx: Character model and animation
 *    - components/DebugPanel.tsx: Developer tools and state inspection
 *    - generated/: Auto-generated TypeScript bindings from the server
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';
import { Identity } from 'spacetimedb';
import { DbConnection, EventContext, ErrorContext } from './generated';
import { PlayerData, InputState } from './generated/types';
import { DebugPanel } from './components/DebugPanel';
import { GameScene } from './components/GameScene';
import { JoinGameDialog } from './components/JoinGameDialog';
import * as THREE from 'three';
import { PlayerUI } from './components/PlayerUI';
import { TradingTerminal } from './components/TradingTerminal';
import { MentorChat } from './components/MentorChat';
import { GameHUD } from './components/GameHUD';
import { MarketAsset, Portfolio, VehicleCatalog, FirmData, Employee, PropertyCatalog, OwnedProperty, RichListEntry, MarketNews } from './generated/types';
import { RichList } from './components/RichList';
import { NewsTicker } from './components/NewsTicker';
import { MethodologyModal } from './components/MethodologyModal';
import { QuestLog } from './components/QuestLog';
import { generateMarketEvent } from './services/AI_Market_Events';
import { DEMO_DURATION_MS, runDemoTimeline } from './demoTimeline';
import { dlog, dwarn, derror } from './debug';

let conn: DbConnection | null = null;

const BROKERAGE_POS = { x: 0, z: -18 };
const MENTOR_POS = { x: -18, z: 12 };
const INTERACT_RADIUS = 10;

function distance2D(ax: number, az: number, bx: number, bz: number) {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

function App() {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [statusMessage, setStatusMessage] = useState("Connecting...");
  const [players, setPlayers] = useState<ReadonlyMap<string, PlayerData>>(new Map());
  const [localPlayer, setLocalPlayer] = useState<PlayerData | null>(null);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalog[]>([]);
  const [firm, setFirm] = useState<FirmData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [propertyCatalog, setPropertyCatalog] = useState<PropertyCatalog[]>([]);
  const [ownedProperties, setOwnedProperties] = useState<OwnedProperty[]>([]);
  const [richList, setRichList] = useState<RichListEntry[]>([]);
  const [marketNews, setMarketNews] = useState<MarketNews[]>([]);
  const [marketRegime, setMarketRegime] = useState<number>(0); // sim_math::Regime as u8
  const [completedQuests, setCompletedQuests] = useState<Set<string>>(new Set());
  const [ownedVehicleCount, setOwnedVehicleCount] = useState(0);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showMentor, setShowMentor] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [demoCaption, setDemoCaption] = useState<string | null>(null);
  const [demoProgress, setDemoProgress] = useState(0);
  const isDemo = useRef<boolean>(
    typeof window !== 'undefined' &&
    (() => {
      const p = new URLSearchParams(window.location.search);
      return p.get('demo') === '1' || p.get('demo') === 'true';
    })()
  ).current;
  const demoStartedRef = useRef(false);
  const demoJoinAttemptedRef = useRef(false);
  const handleJoinGameRef = useRef<(username: string, characterClass: string) => void>(() => {});
  const [nearBrokerage, setNearBrokerage] = useState(false);
  const [nearMentor, setNearMentor] = useState(false);

  // --- Refs for stable access in callbacks (avoid stale closures) ---
  const identityRef = useRef<Identity | null>(null);
  const localPlayerRef = useRef<PlayerData | null>(null);
  const connectedRef = useRef(false);

  // --- Ref for current input state ---
  const currentInputRef = useRef<InputState>({
    forward: false, backward: false, left: false, right: false,
    sprint: false, jump: false, attack: false, castSpell: false,
    sequence: 0,
  });
  const lastSentInputState = useRef<Partial<InputState>>({});
  const animationFrameIdRef = useRef<number | null>(null);

  // Rotation ref for player rotation data
  const playerRotationRef = useRef<THREE.Euler>(new THREE.Euler(0, 0, 0, 'YXZ'));

  // --- Table Callbacks/Subscription Functions ---
  const registerTableCallbacks = useCallback(() => {
    if (!conn) return;
    dlog("Registering table callbacks...");

    conn.db.player.onInsert((_ctx: EventContext, player: PlayerData) => {
        dlog("Player inserted (callback):", player.identity.toHexString());
        setPlayers((prev: ReadonlyMap<string, PlayerData>) => new Map(prev).set(player.identity.toHexString(), player));
        if (identityRef.current && player.identity.toHexString() === identityRef.current.toHexString()) {
            setLocalPlayer(player);
            localPlayerRef.current = player;
            setStatusMessage(`Registered as ${player.username}`);
        }
    });

    conn.db.player.onUpdate((_ctx: EventContext, _oldPlayer: PlayerData, newPlayer: PlayerData) => {
        setPlayers((prev: ReadonlyMap<string, PlayerData>) => {
            const newMap = new Map(prev);
            newMap.set(newPlayer.identity.toHexString(), newPlayer);
            return newMap;
        });
        if (identityRef.current && newPlayer.identity.toHexString() === identityRef.current.toHexString()) {
            setLocalPlayer(newPlayer);
            localPlayerRef.current = newPlayer;
        }
    });

    conn.db.player.onDelete((_ctx: EventContext, player: PlayerData) => {
        dlog("Player deleted (callback):", player.identity.toHexString());
        setPlayers((prev: ReadonlyMap<string, PlayerData>) => {
            const newMap = new Map(prev);
            newMap.delete(player.identity.toHexString());
            return newMap;
        });
        if (identityRef.current && player.identity.toHexString() === identityRef.current.toHexString()) {
            setLocalPlayer(null);
            localPlayerRef.current = null;
            setStatusMessage("Local player deleted!");
        }
    });
    const syncMarket = () => {
      if (!conn) return;
      setMarketAssets([...conn.db.market_asset.iter()]);
    };
    const syncPortfolio = () => {
      if (!conn || !identityRef.current) return;
      const myId = identityRef.current.toHexString();
      setPortfolio([...conn.db.portfolio.iter()].filter(
        (p) => p.ownerIdentity.toHexString() === myId
      ));
    };
    const syncVehicles = () => {
      if (!conn) return;
      setVehicleCatalog([...conn.db.vehicle_catalog.iter()]);
    };
    const syncFirm = () => {
      if (!conn || !identityRef.current) return;
      const myId = identityRef.current;
      setFirm(conn.db.firm.owner_identity.find(myId) ?? null);
      setEmployees([...conn.db.employee.iter()].filter((e) => e.ownerIdentity.toHexString() === myId.toHexString()));
      setOwnedProperties([...conn.db.owned_property.iter()].filter((p) => p.ownerIdentity.toHexString() === myId.toHexString()));
    };
    const syncProperties = () => {
      if (!conn) return;
      setPropertyCatalog([...conn.db.property_catalog.iter()]);
    };
    const syncRichList = () => {
      if (!conn) return;
      setRichList([...conn.db.rich_list_view.iter()]);
    };
    const syncNews = () => {
      if (!conn) return;
      setMarketNews([...conn.db.market_news.iter()]);
    };
    const syncRegime = () => {
      if (!conn) return;
      const row = [...conn.db.market_regime.iter()][0];
      if (row) setMarketRegime(row.regime);
    };
    const syncQuests = () => {
      if (!conn || !identityRef.current) return;
      const myId = identityRef.current.toHexString();
      setCompletedQuests(
        new Set(
          [...conn.db.completed_quest.iter()]
            .filter((q) => q.ownerIdentity.toHexString() === myId)
            .map((q) => q.questKey)
        )
      );
    };
    const syncOwnedVehicles = () => {
      if (!conn || !identityRef.current) return;
      const myId = identityRef.current.toHexString();
      setOwnedVehicleCount(
        [...conn.db.owned_vehicle.iter()].filter(
          (v) => v.ownerIdentity.toHexString() === myId
        ).length
      );
    };

    conn.db.market_asset.onInsert((_ctx, _row) => syncMarket());
    conn.db.market_asset.onUpdate((_ctx, _old, _new) => syncMarket());
    conn.db.market_asset.onDelete((_ctx, _row) => syncMarket());

    conn.db.portfolio.onInsert((_ctx, _row) => syncPortfolio());
    conn.db.portfolio.onUpdate((_ctx, _old, _new) => syncPortfolio());
    conn.db.portfolio.onDelete((_ctx, _row) => syncPortfolio());

    conn.db.vehicle_catalog.onInsert((_ctx, _row) => syncVehicles());
    conn.db.vehicle_catalog.onUpdate((_ctx, _old, _new) => syncVehicles());

    conn.db.firm.onInsert((_ctx, _row) => syncFirm());
    conn.db.firm.onUpdate((_ctx, _old, _new) => syncFirm());
    conn.db.employee.onInsert((_ctx, _row) => syncFirm());
    conn.db.employee.onUpdate((_ctx, _old, _new) => syncFirm());
    conn.db.employee.onDelete((_ctx, _row) => syncFirm());
    conn.db.owned_property.onInsert((_ctx, _row) => syncFirm());
    conn.db.owned_property.onDelete((_ctx, _row) => syncFirm());
    conn.db.property_catalog.onInsert((_ctx, _row) => syncProperties());

    conn.db.rich_list_view.onInsert((_ctx, _row) => syncRichList());
    conn.db.rich_list_view.onUpdate((_ctx, _old, _new) => syncRichList());
    conn.db.rich_list_view.onDelete((_ctx, _row) => syncRichList());

    conn.db.market_news.onInsert((_ctx, _row) => syncNews());
    conn.db.market_news.onDelete((_ctx, _row) => syncNews());

    conn.db.market_regime.onInsert((_ctx, _row) => syncRegime());
    conn.db.market_regime.onUpdate((_ctx, _old, _new) => syncRegime());

    conn.db.completed_quest.onInsert((_ctx, _row) => syncQuests());
    conn.db.completed_quest.onDelete((_ctx, _row) => syncQuests());

    conn.db.owned_vehicle.onInsert((_ctx, _row) => syncOwnedVehicles());
    conn.db.owned_vehicle.onDelete((_ctx, _row) => syncOwnedVehicles());

    dlog("Table callbacks registered.");
  }, []);

  const onSubscriptionApplied = useCallback(() => {
     dlog("Subscription applied successfully.");
     setPlayers((prev: ReadonlyMap<string, PlayerData>) => {
         if (prev.size === 0 && conn) {
             const currentPlayers = new Map<string, PlayerData>();
             for (const player of conn.db.player.iter()) {
                 currentPlayers.set(player.identity.toHexString(), player);
                 if (identityRef.current && player.identity.toHexString() === identityRef.current.toHexString()) {
                     setLocalPlayer(player);
                     localPlayerRef.current = player;
                 }
             }
             return currentPlayers;
         }
         return prev;
     });
     if (conn) {
      setMarketAssets([...conn.db.market_asset.iter()]);
      setVehicleCatalog([...conn.db.vehicle_catalog.iter()]);
      setPropertyCatalog([...conn.db.property_catalog.iter()]);
      setRichList([...conn.db.rich_list_view.iter()]);
      setMarketNews([...conn.db.market_news.iter()]);
      { const r = [...conn.db.market_regime.iter()][0]; if (r) setMarketRegime(r.regime); }
       if (identityRef.current) {
         const myId = identityRef.current;
         setPortfolio([...conn.db.portfolio.iter()].filter(
           (p) => p.ownerIdentity.toHexString() === myId.toHexString()
         ));
         setFirm(conn.db.firm.owner_identity.find(myId) ?? null);
        setEmployees([...conn.db.employee.iter()].filter((e) => e.ownerIdentity.toHexString() === myId.toHexString()));
        setOwnedProperties([...conn.db.owned_property.iter()].filter((p) => p.ownerIdentity.toHexString() === myId.toHexString()));
        setOwnedVehicleCount([...conn.db.owned_vehicle.iter()].filter((v) => v.ownerIdentity.toHexString() === myId.toHexString()).length);
        setCompletedQuests(new Set([...conn.db.completed_quest.iter()].filter((q) => q.ownerIdentity.toHexString() === myId.toHexString()).map((q) => q.questKey)));

        const existing = conn.db.player.identity.find(myId);
         if (existing) {
           setLocalPlayer(existing);
           localPlayerRef.current = existing;
           setShowJoinDialog(false);
           setStatusMessage(`Welcome back, ${existing.username}`);
         }
       }
     }
  }, []);

  const onSubscriptionError = useCallback((error: any) => {
      derror("Subscription error:", error);
      setStatusMessage(`Subscription Error: ${error?.message || error}`);
  }, []);

  const subscribeToTables = useCallback(() => {
    if (!conn) return;
    dlog("Subscribing to tables...");
    conn.subscriptionBuilder()
      .onApplied(onSubscriptionApplied)
      .onError(onSubscriptionError)
      .subscribe([
        "SELECT * FROM player",
        "SELECT * FROM market_asset",
        "SELECT * FROM portfolio",
        "SELECT * FROM vehicle_catalog",
        "SELECT * FROM owned_vehicle",
        "SELECT * FROM firm",
        "SELECT * FROM employee",
        "SELECT * FROM property_catalog",
        "SELECT * FROM owned_property",
        "SELECT * FROM rich_list_view",
        "SELECT * FROM market_news",
        "SELECT * FROM market_regime",
        "SELECT * FROM completed_quest",
      ]);
  }, [onSubscriptionApplied, onSubscriptionError]);

  // --- Event Handlers ---
  const handleDelegatedClick = useCallback((event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest('.interactive-button');
      if (button) {
          event.preventDefault();
          dlog(`[CLIENT] Button click detected: ${button.getAttribute('data-action')}`);
      }
  }, []);

  // --- Input State Management ---
  const keyMap: { [key: string]: keyof Omit<InputState, 'sequence' | 'castSpell'> } = {
      KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right',
      ShiftLeft: 'sprint', Space: 'jump',
  };

  const determineAnimation = useCallback((input: InputState): string => {
    if (input.attack) return 'attack1';
    if (input.castSpell) return 'cast';
    if (input.jump) return 'jump';

    const { forward, backward, left, right, sprint } = input;
    const isMoving = forward || backward || left || right;

    if (!isMoving) return 'idle';

    let direction = 'forward';

    if (forward && !backward) {
      direction = 'forward';
    } else if (backward && !forward) {
      direction = 'back';
    } else if (left && !right) {
      direction = 'left';
    } else if (right && !left) {
      direction = 'right';
    } else if (forward && left) {
      direction = 'left';
    } else if (forward && right) {
      direction = 'right';
    } else if (backward && left) {
      direction = 'left';
    } else if (backward && right) {
      direction = 'right';
    }

    const moveType = sprint ? 'run' : 'walk';
    const animationName = `${moveType}-${direction}`;

    return animationName;
  }, []);

  const sendInput = useCallback((currentInputState: InputState) => {
    if (!conn || !identityRef.current || !connectedRef.current) return;
    const currentPosition = localPlayerRef.current?.position || { x: 0, y: 0, z: 0 };

    const currentRotation = {
      x: playerRotationRef.current.x,
      y: playerRotationRef.current.y,
      z: playerRotationRef.current.z
    };

    const currentAnimation = determineAnimation(currentInputState);

    let changed = false;
    for (const key in currentInputState) {
        if (currentInputState[key as keyof InputState] !== lastSentInputState.current[key as keyof InputState]) {
            changed = true;
            break;
        }
    }

    if (changed || currentInputState.sequence !== lastSentInputState.current.sequence) {
        conn.reducers.updatePlayerInput({ input: currentInputState, clientPos: currentPosition, clientRot: currentRotation, clientAnimation: currentAnimation });
        lastSentInputState.current = { ...currentInputState };
    }
  }, [determineAnimation]);

  // Stable ref for sendInput so game loop doesn't restart
  const sendInputRef = useRef(sendInput);
  sendInputRef.current = sendInput;

  // Add player rotation handler
  const handlePlayerRotation = useCallback((rotation: THREE.Euler) => {
    playerRotationRef.current.copy(rotation);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === 'KeyT' && !showTerminal && !showMentor) {
        setShowTerminal(true);
        return;
      }
      if (event.code === 'KeyE' && !showMentor && !showTerminal) {
        setShowMentor(true);
        return;
      }
      if (event.code === 'KeyQ' && !showTerminal && !showMentor) {
        setShowQuests((prev) => !prev);
        return;
      }
      if (event.code === 'Escape') {
        setShowTerminal(false);
        setShowMentor(false);
        setShowQuests(false);
        return;
      }

      const action = keyMap[event.code];
      if (action) {
          if (!currentInputRef.current[action]) {
             currentInputRef.current[action] = true;
          }
      }
  }, [nearBrokerage, nearMentor, showTerminal, showMentor]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
      const action = keyMap[event.code];
      if (action) {
          if (currentInputRef.current[action]) {
              currentInputRef.current[action] = false;
          }
      }
  }, []);

  const handleMouseDown = useCallback((event: MouseEvent) => {
      if (event.button === 0) {
           if (!currentInputRef.current.attack) {
               currentInputRef.current.attack = true;
           }
      }
  }, []);

  const handleMouseUp = useCallback((event: MouseEvent) => {
      if (event.button === 0) {
           if (currentInputRef.current.attack) {
               currentInputRef.current.attack = false;
           }
      }
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (document.pointerLockElement === document.body) {
      const sensitivity = 0.002;
      playerRotationRef.current.y -= event.movementX * sensitivity;

      playerRotationRef.current.x = Math.max(
        -Math.PI / 2.5,
        Math.min(Math.PI / 2.5, playerRotationRef.current.x - event.movementY * sensitivity)
      );
    }
  }, []);

  // --- Listener Setup/Removal Functions ---
  const handlePointerLockChange = useCallback(() => {
    setIsPointerLocked(document.pointerLockElement === document.body);
    dlog("Pointer Lock Changed: ", document.pointerLockElement === document.body);
  }, []);

  const setupInputListeners = useCallback(() => {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('pointerlockchange', handlePointerLockChange);
      dlog("Input listeners added.");
  }, [handleKeyDown, handleKeyUp, handleMouseDown, handleMouseUp, handleMouseMove, handlePointerLockChange]);

  const removeInputListeners = useCallback(() => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      dlog("Input listeners removed.");
  }, [handleKeyDown, handleKeyUp, handleMouseDown, handleMouseUp, handleMouseMove, handlePointerLockChange]);

  const setupDelegatedListeners = useCallback(() => {
      document.body.addEventListener('click', handleDelegatedClick, true);
      dlog("Delegated listener added to body.");
  }, [handleDelegatedClick]);

  const removeDelegatedListeners = useCallback(() => {
      document.body.removeEventListener('click', handleDelegatedClick, true);
      dlog("Delegated listener removed from body.");
  }, [handleDelegatedClick]);

  // --- Game Loop Effect (throttled to ~20Hz, uses stable ref to avoid restarts) ---
  useEffect(() => {
      const INPUT_SEND_INTERVAL = 50; // ms (~20Hz)
      let lastSendTime = 0;
      const gameLoop = () => {
          if (!connectedRef.current || !conn || !identityRef.current) {
              if (animationFrameIdRef.current) {
                  cancelAnimationFrame(animationFrameIdRef.current);
                  animationFrameIdRef.current = null;
              }
              return;
          }
          const now = performance.now();
          if (now - lastSendTime >= INPUT_SEND_INTERVAL) {
              currentInputRef.current.sequence += 1;
              sendInputRef.current(currentInputRef.current);
              lastSendTime = now;
          }
          animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      };

      if (connected && !animationFrameIdRef.current) {
          dlog("[CLIENT] Starting game loop.");
          animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      }

      return () => {
          if (animationFrameIdRef.current) {
              dlog("[CLIENT] Stopping game loop.");
              cancelAnimationFrame(animationFrameIdRef.current);
              animationFrameIdRef.current = null;
          }
      };
  }, [connected]);

  useEffect(() => {
    if (!localPlayer) {
      setNearBrokerage(false);
      setNearMentor(false);
      return;
    }
    const { x, z } = localPlayer.position;
    setNearBrokerage(distance2D(x, z, BROKERAGE_POS.x, BROKERAGE_POS.z) < INTERACT_RADIUS);
    setNearMentor(distance2D(x, z, MENTOR_POS.x, MENTOR_POS.z) < INTERACT_RADIUS);
  }, [localPlayer]);

  // --- Connection Effect Hook ---
  useEffect(() => {
    dlog("Running Connection Effect Hook...");
    if (conn) {
        dlog("Connection already established, skipping setup.");
         if (connected) {
             setupInputListeners();
             setupDelegatedListeners();
         }
        return;
    }

    const dbHost = import.meta.env.VITE_SPACETIME_HOST ?? "maincloud.spacetimedb.com";
    const dbName = import.meta.env.VITE_SPACETIME_DB ?? "quant-link";
    const dbUri = dbHost.startsWith("ws")
      ? dbHost
      : dbHost.includes("spacetimedb.com")
        ? `wss://${dbHost.replace(/^https?:\/\//, "")}`
        : `ws://${dbHost.replace(/^https?:\/\//, "")}`;

    dlog(`Connecting to SpacetimeDB at ${dbUri}, database: ${dbName}...`);

    const onConnect = (connection: DbConnection, id: Identity, _token: string) => {
      dlog("Connected!");
      conn = connection;
      identityRef.current = id;
      connectedRef.current = true;
      setIdentity(id);
      setConnected(true);
      setStatusMessage(`Connected as ${id.toHexString().substring(0, 8)}...`);
      registerTableCallbacks();
      subscribeToTables();
      setupInputListeners();
      setupDelegatedListeners();

      const existingPlayer = connection.db.player.identity.find(id);
      if (existingPlayer) {
        setLocalPlayer(existingPlayer);
        localPlayerRef.current = existingPlayer;
        setShowJoinDialog(false);
        setStatusMessage(`Welcome back, ${existingPlayer.username}`);
      } else {
        setShowJoinDialog(true);
      }
    };

    const onDisconnect = (_ctx: ErrorContext, reason?: Error | null) => {
      const reasonStr = reason ? reason.message : "No reason given";
      dlog("onDisconnect triggered:", reasonStr);
      setStatusMessage(`Disconnected: ${reasonStr}`);
      conn = null;
      identityRef.current = null;
      connectedRef.current = false;
      localPlayerRef.current = null;
      setIdentity(null);
      setConnected(false);
      setPlayers(new Map());
      setLocalPlayer(null);
    };

    DbConnection.builder()
      .withUri(dbUri)
      .withDatabaseName(dbName)
      .withConfirmedReads(false)
      .onConnect(onConnect)
      .onDisconnect(onDisconnect)
      .build();

    return () => {
      dlog("Cleaning up connection effect - removing listeners.");
      removeInputListeners();
      removeDelegatedListeners();
    };
  }, []);

  // --- AI Market Events Generator ---
  // Drives the server-authoritative `apply_market_shock` reducer. A connected
  // browser client periodically asks the AI (or offline simulator) for a
  // breaking headline + sentiment, then broadcasts the shock to all traders.
  useEffect(() => {
    if (!connected || !localPlayer) return;

    let cancelled = false;
    const fireEvent = async () => {
      if (cancelled || !conn) return;
      try {
        const event = await generateMarketEvent();
        if (cancelled || !conn) return;
        conn.reducers.applyMarketShock({ headline: event.headline, sentiment: event.sentiment });
        dlog(`[AI Market Events] (${event.source}) ${event.headline} [${event.sentiment}]`);
      } catch (err) {
        dwarn('[AI Market Events] failed to apply shock:', err);
      }
    };

    // Kick off one shortly after joining so the demo comes alive fast.
    const initial = setTimeout(fireEvent, 8000);
    const interval = setInterval(fireEvent, 60000);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [connected, localPlayer]);

  // Stable id — only changes when player first appears, NOT on every server tick.
  const localPlayerId = localPlayer?.identity.toHexString() ?? null;

  // --- DEMO MODE (?demo=1): auto-join + scripted, captioned game tour ---
  useEffect(() => {
    if (!isDemo) return;
    setDemoCaption('Loading QuantLink 3-minute demo…');
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo) return;
    if (!connected) {
      demoStartedRef.current = false;
      demoJoinAttemptedRef.current = false;
      setDemoCaption('Connecting to SpacetimeDB Maincloud…');
      return;
    }
    if (!localPlayerId && conn && !demoJoinAttemptedRef.current) {
      demoJoinAttemptedRef.current = true;
      setShowJoinDialog(false);
      setDemoCaption('Auto-joining as QuantLink Demo…');
      handleJoinGameRef.current('QuantLink Demo', 'Wizard');
    }
  }, [isDemo, connected, localPlayerId]);

  useEffect(() => {
    // CRITICAL: depend on localPlayerId (stable), NOT localPlayer object.
    // localPlayer updates every server tick; depending on it killed the timeline
    // after the first position update and demoStartedRef blocked restart.
    if (!isDemo || !connected || !localPlayerId || demoStartedRef.current) return;
    demoStartedRef.current = true;

    const intervals: ReturnType<typeof setInterval>[] = [];
    const startedAt = performance.now();

    const progressId = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setDemoProgress(Math.min(100, (elapsed / DEMO_DURATION_MS) * 100));
    }, 200);

    const cleanup = runDemoTimeline({
      conn,
      input: currentInputRef.current,
      playerRotationRef,
      setCaption: setDemoCaption,
      setShowTerminal,
      setShowMentor,
      setShowQuests,
      intervals,
    });

    return () => {
      clearInterval(progressId);
      cleanup();
      setDemoProgress(0);
      demoStartedRef.current = false;
    };
  }, [isDemo, connected, localPlayerId]);

  // --- handleJoinGame ---
  const handleJoinGame = (username: string, characterClass: string) => {
    if (!conn) {
        derror("Cannot join game, not connected.");
        return;
    }
    dlog(`Registering as ${username} (${characterClass})...`);
    conn.reducers.registerPlayer({ username, characterClass });
    setShowJoinDialog(false);
  };
  handleJoinGameRef.current = handleJoinGame;

  // --- Render Logic ---
  return (
    <div className="App" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {showJoinDialog && !isDemo && <JoinGameDialog onJoin={handleJoinGame} />}

      {isDemo && (
        <>
          <div className="demo-recording-badge">● DEMO RECORDING — 3 MIN AUTO-PLAY</div>
          {demoCaption && (
            <div className="demo-caption">
              <span>{demoCaption}</span>
              <div className="demo-progress-track">
                <div className="demo-progress-fill" style={{ width: `${demoProgress}%` }} />
              </div>
            </div>
          )}
        </>
      )}

      {connected && (
          <DebugPanel
            statusMessage={statusMessage}
            localPlayer={localPlayer}
            identity={identity}
            playerMap={players}
            expanded={isDebugPanelExpanded}
            onToggleExpanded={() => setIsDebugPanelExpanded((prev: boolean) => !prev)}
            isPointerLocked={isPointerLocked}
          />
      )}

      {connected && (
        <>
          <GameScene
            players={players}
            localPlayerIdentity={identity}
            marketAssets={marketAssets}
            onPlayerRotation={handlePlayerRotation}
            currentInputRef={currentInputRef}
            isDebugPanelVisible={isDebugPanelExpanded}
          />
          <GameHUD
            marketAssets={marketAssets}
            onOpenTerminal={() => setShowTerminal(true)}
            onOpenMentor={() => setShowMentor(true)}
            onOpenMethodology={() => setShowMethodology(true)}
            nearBrokerage={nearBrokerage}
            nearMentor={nearMentor}
          />
          {localPlayer && (
            <PlayerUI
              playerData={localPlayer}
              marketAssets={marketAssets}
              portfolio={portfolio}
              firm={firm}
            />
          )}

          <RichList entries={richList} localIdentity={identity} />
          <NewsTicker news={marketNews} regime={marketRegime} onRegimeClick={() => setShowMethodology(true)} />

          {showMethodology && <MethodologyModal onClose={() => setShowMethodology(false)} />}

          {localPlayer && !showTerminal && !showMentor && !isDemo && (
            <button className="quest-fab" onClick={() => setShowQuests((p) => !p)}>
              🎯 Objectives
              {(() => {
                const ready = [
                  portfolio.length >= 1 && !completedQuests.has('first_trade'),
                  new Set(portfolio.map((p) => p.ticker)).size >= 3 && !completedQuests.has('diversify'),
                  employees.length >= 1 && !completedQuests.has('first_hire'),
                  employees.length >= 3 && !completedQuests.has('team_builder'),
                  ownedProperties.length >= 1 && !completedQuests.has('property_mogul'),
                  ownedVehicleCount >= 1 && !completedQuests.has('first_car'),
                  localPlayer.knowledgeLevel >= 1 && !completedQuests.has('knowledge'),
                  (firm?.tier ?? 0) >= 1 && !completedQuests.has('firm_upgrade'),
                ].filter(Boolean).length;
                return ready > 0 ? <span className="quest-fab-badge">{ready}</span> : null;
              })()}
            </button>
          )}

          {showQuests && conn && localPlayer && (
            <QuestLog
              conn={conn}
              localPlayer={localPlayer}
              marketAssets={marketAssets}
              portfolio={portfolio}
              employees={employees}
              ownedProperties={ownedProperties}
              ownedVehicleCount={ownedVehicleCount}
              firm={firm}
              claimedKeys={completedQuests}
              onClose={() => setShowQuests(false)}
            />
          )}

          {(nearBrokerage || nearMentor) && !showTerminal && !showMentor && (
            <div className="proximity-hint">
              {nearBrokerage && <span>Press <kbd>T</kbd> to open QuantLink Terminal</span>}
              {nearBrokerage && nearMentor && <span> · </span>}
              {nearMentor && <span>Press <kbd>E</kbd> to speak with Senior Quant</span>}
            </div>
          )}

          {showTerminal && conn && localPlayer && (
            <TradingTerminal
              conn={conn}
              localPlayer={localPlayer}
              marketAssets={marketAssets}
              portfolio={portfolio}
              vehicleCatalog={vehicleCatalog}
              firm={firm}
              employees={employees}
              propertyCatalog={propertyCatalog}
              ownedProperties={ownedProperties}
              onClose={() => setShowTerminal(false)}
            />
          )}

          {showMentor && localPlayer && (
            <MentorChat
              localPlayer={localPlayer}
              portfolio={portfolio}
              marketAssets={marketAssets}
              onClose={() => setShowMentor(false)}
            />
          )}
        </>
      )}

      {!connected && (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100%'}}><h1>{statusMessage}</h1></div>
      )}
    </div>
  );
}

export default App;
