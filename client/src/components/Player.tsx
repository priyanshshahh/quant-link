/**
 * Player.tsx
 * 
 * Component responsible for rendering and controlling individual player entities:
 * 
 * Key functionality:
 * - Handles 3D character model rendering with appropriate animations
 * - Implements physics-based player movement and collision detection
 * - Manages player state synchronization in multiplayer environment
 * - Processes user input for character control (keyboard/mouse)
 * - Handles different player classes with unique visual appearances
 * - Distinguishes between local player (user-controlled) and remote players
 * 
 * Props:
 * - playerClass: Determines visual appearance and possibly abilities
 * - username: Unique identifier displayed above character
 * - position: Initial spawn coordinates
 * - color: Optional custom color for character
 * - isLocal: Boolean determining if this is the user-controlled player
 * - socketId: Unique network identifier for player synchronization
 * 
 * Technical implementation:
 * - Uses React Three Fiber for 3D rendering within React
 * - Implements Rapier physics for movement and collision
 * - Manages socket.io communication for multiplayer state sync
 * - Handles animation state management for character model
 * 
 * Related files:
 * - GameScene.tsx: Parent component that instantiates players
 * - PlayerUI.tsx: UI overlay for player status information
 * - Server socket handlers: For network state synchronization
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, Sphere } from '@react-three/drei';
import { PlayerData, InputState } from '../generated/types';
import { loadCharacterAssets, instantiateCharacter } from './playerAssets';
import { dlog, dwarn, derror } from '../debug';

// Define animation names for reuse
const ANIMATIONS = {
  IDLE: 'idle',
  WALK_FORWARD: 'walk-forward',
  WALK_BACK: 'walk-back',
  WALK_LEFT: 'walk-left',
  WALK_RIGHT: 'walk-right',
  RUN_FORWARD: 'run-forward',
  RUN_BACK: 'run-back',
  RUN_LEFT: 'run-left',
  RUN_RIGHT: 'run-right',
  JUMP: 'jump',
  ATTACK: 'attack1',
  CAST: 'cast',
  DAMAGE: 'damage',
  DEATH: 'death',
};

// --- Client-side Constants ---
const PLAYER_SPEED = 7.5; // Match server logic (common.rs PLAYER_SPEED)
const SPRINT_MULTIPLIER = 1.8; // Match server logic

// --- Client-side Prediction Constants ---
const SERVER_TICK_RATE = 20; // Client sends input at ~20Hz
const SERVER_TICK_DELTA = 1 / SERVER_TICK_RATE; // Use this for prediction
const POSITION_RECONCILE_THRESHOLD = 0.4;
const ROTATION_RECONCILE_THRESHOLD = 0.1; // Radians
const RECONCILE_LERP_FACTOR = 0.15;

// --- Camera Constants ---
const CAMERA_MODES = {
  FOLLOW: 'follow',  // Default camera following behind player
  ORBITAL: 'orbital' // Orbital camera that rotates around the player
};

interface PlayerProps {
  playerData: PlayerData;
  isLocalPlayer: boolean;
  onRotationChange?: (rotation: THREE.Euler) => void;
  currentInputRef?: React.MutableRefObject<InputState>; // Ref for live input access in useFrame
  isDebugArrowVisible?: boolean; // Prop to control debug arrow visibility
  isDebugPanelVisible?: boolean; // Prop to control general debug helpers visibility
}

export const Player: React.FC<PlayerProps> = ({
  playerData,
  isLocalPlayer,
  onRotationChange,
  currentInputRef, // Ref for live input access in useFrame
  isDebugArrowVisible = false, 
  isDebugPanelVisible = false // Destructure with default false
}) => {
  const group = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  const dataRef = useRef<PlayerData>(playerData);
  const characterClass = playerData.characterClass || 'Wizard';
  
  // Model management
  const [modelLoaded, setModelLoaded] = useState(false);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
  const [animations, setAnimations] = useState<Record<string, THREE.AnimationAction>>({});
  const [currentAnimation, setCurrentAnimation] = useState<string>(ANIMATIONS.IDLE);
  
  // --- Client Prediction State ---
  const localPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(playerData.position.x, playerData.position.y, playerData.position.z));
  const localRotationRef = useRef<THREE.Euler>(new THREE.Euler(0, 0, 0, 'YXZ')); // Initialize with zero rotation
  const debugArrowRef = useRef<THREE.ArrowHelper | null>(null); // Declare the ref for the debug arrow
  
  // Camera control variables
  const isPointerLocked = useRef(false);
  const zoomLevel = useRef(5);
  const targetZoom = useRef(5);
  // Smoothed camera look-at target (gives the camera a soft spring-trail feel)
  const cameraLookRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const cameraInitializedRef = useRef(false);
  
  // Orbital camera variables
  const [cameraMode, setCameraMode] = useState<string>(CAMERA_MODES.FOLLOW);
  const orbitalCameraRef = useRef({
    distance: 8,
    height: 3,
    angle: 0,
    elevation: Math.PI / 6, // Approximately 30 degrees
    autoRotate: false,
    autoRotateSpeed: 0.5,
    lastUpdateTime: Date.now(),
    playerFacingRotation: 0 // Store player's facing direction when entering orbital mode
  });
  
  // --- State variables ---
  const pointLightRef = useRef<THREE.PointLight>(null!); // Ref for the declarative light

  // --- Client-Side Movement Calculation (Matches Server Logic *before* Sign Flip) ---
  const calculateClientMovement = useCallback((currentPos: THREE.Vector3, currentRot: THREE.Euler, inputState: InputState, delta: number): THREE.Vector3 => {
    // dlog(`[Move Calc] cameraMode: ${cameraMode}`); // Suppressed log
    
    // Skip if no movement input
    if (!inputState.forward && !inputState.backward && !inputState.left && !inputState.right) {
      return currentPos;
    }

    let worldMoveVector = new THREE.Vector3();
    const speed = inputState.sprint ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED;
    let rotationYaw = 0;

    // 1. Calculate local movement vector based on WASD
    let localMoveX = 0;
    let localMoveZ = 0;
    if (cameraMode === CAMERA_MODES.ORBITAL) {
        if (inputState.forward) localMoveZ += 1;
        if (inputState.backward) localMoveZ -= 1;
        if (inputState.left) localMoveX += 1;
        if (inputState.right) localMoveX -= 1;
    } else {
        if (inputState.forward) localMoveZ -= 1;
        if (inputState.backward) localMoveZ += 1;
        if (inputState.left) localMoveX -= 1;
        if (inputState.right) localMoveX += 1;
    }
    const localMoveVector = new THREE.Vector3(localMoveX, 0, localMoveZ);

    // Normalize if diagonal movement
    if (localMoveVector.lengthSq() > 1.1) {
      localMoveVector.normalize();
    }

    // 2. Determine which rotation to use based on camera mode
    if (cameraMode === CAMERA_MODES.FOLLOW) {
      // --- FOLLOW MODE: Use current player rotation ---
      rotationYaw = currentRot.y;
    } else {
      // --- ORBITAL MODE: Use fixed rotation from when mode was entered ---
      rotationYaw = orbitalCameraRef.current.playerFacingRotation;
      dlog(`[Orbital Move Calc] Mode: ORBITAL, Using fixed yaw: ${rotationYaw.toFixed(3)}`);
    }

    // 3. Rotate the LOCAL movement vector by the appropriate YAW to get the WORLD direction
    worldMoveVector = localMoveVector.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationYaw);

    // 4. Scale by speed and delta time
    worldMoveVector.multiplyScalar(speed * delta);

    // 5. Calculate the final position based on the raw world movement
    // The server-side sign flip is handled during reconciliation, not prediction.
    const finalPosition = currentPos.clone().add(worldMoveVector);

    // Debug log for orbital mode
    if (cameraMode === CAMERA_MODES.ORBITAL) {
        dlog(`[Orbital Move Calc] Input: F${inputState.forward?1:0} B${inputState.backward?1:0} L${inputState.left?1:0} R${inputState.right?1:0}, MoveVector: (${worldMoveVector.x.toFixed(2)}, ${worldMoveVector.z.toFixed(2)}), Delta: ${delta.toFixed(4)}`);
    }

    return finalPosition;
  }, [cameraMode]); // Depend on cameraMode from state

  // --- Load shared character assets and instantiate this player's model ---
  // Model + animation clips are loaded once per character class and cached in
  // playerAssets.ts; each Player clones the rigged template (independent
  // animation) and builds its own mixer/actions from the shared clips.
  useEffect(() => {
    let cancelled = false;
    let createdMixer: THREE.AnimationMixer | null = null;
    let createdModel: THREE.Group | null = null;
    const groupEl = group.current;

    loadCharacterAssets(characterClass)
      .then(({ template, clips }) => {
        if (cancelled || !groupEl) return;

        const fbx = instantiateCharacter(template);
        fbx.position.set(0, -0.1, 0); // Lower the model slightly onto the ground
        groupEl.add(fbx);

        const newMixer = new THREE.AnimationMixer(fbx);
        const acts: Record<string, THREE.AnimationAction> = {};
        Object.entries(clips).forEach(([name, clip]) => {
          const action = newMixer.clipAction(clip);
          if (name === 'idle' || name.startsWith('walk-') || name.startsWith('run-')) {
            action.setLoop(THREE.LoopRepeat, Infinity);
          } else {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          acts[name] = action;
        });

        createdMixer = newMixer;
        createdModel = fbx;

        setModel(fbx);
        setMixer(newMixer);
        setAnimations(acts);
        setModelLoaded(true);

        // Play idle immediately so the model isn't stuck in a T-pose.
        if (acts['idle']) {
          acts['idle'].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.25).play();
          setCurrentAnimation('idle');
        }

        if (isLocalPlayer) {
          localPositionRef.current.set(playerData.position.x, playerData.position.y, playerData.position.z);
          localRotationRef.current.set(0, playerData.rotation.y, 0, 'YXZ');
        }
      })
      .catch((err) => derror(`[Player ${playerData.username}] Failed to load character assets:`, err));

    return () => {
      cancelled = true;
      if (createdMixer) createdMixer.stopAllAction();
      if (createdModel && groupEl) groupEl.remove(createdModel);
      setModel(null);
      setMixer(null);
      setModelLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterClass]);

  // Update playAnimation to have better logging
  const playAnimation = useCallback((name: string, crossfadeDuration = 0.3) => {
    if (!mixer) return; // Ensure mixer exists
    
    if (!animations[name]) {
      // dwarn(`Animation not found: ${name}`);
      // dlog("Available animations:", Object.keys(animations).join(", "));
      // Fallback to idle if requested animation is missing
      if (name !== ANIMATIONS.IDLE && animations[ANIMATIONS.IDLE]) {
        // dlog(`Falling back to ${ANIMATIONS.IDLE}`);
        name = ANIMATIONS.IDLE;
      } else {
         return; // Cannot play requested or fallback idle
      }
    }
    
    // dlog(`Playing animation: ${name} (crossfade: ${crossfadeDuration}s)`);
    
    const targetAction = animations[name];
    const currentAction = animations[currentAnimation];
    
    if (currentAction && currentAction !== targetAction) {
      // dlog(`Fading out previous animation: ${currentAnimation}`);
      currentAction.fadeOut(crossfadeDuration);
    }
    
    // dlog(`Starting animation: ${name}`);
    targetAction.reset()
                .setEffectiveTimeScale(1)
                .setEffectiveWeight(1)
                .fadeIn(crossfadeDuration)
                .play();
                
    setCurrentAnimation(name);
  }, [animations, currentAnimation, mixer]); // Add mixer to dependencies

  // --- NEW Effect: Explicitly set shadow props when model is loaded ---
  useEffect(() => {
    if (model && group.current) {
      dlog(`[Player Shadow Effect ${playerData.username}] Model loaded, traversing group to set shadow props on meshes.`);
      group.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Explicitly set both cast and receive, although cast is the primary goal here
          child.castShadow = true;
          child.receiveShadow = true; 
        }
      });
    }
  }, [model]); // Run this effect whenever the model state changes

  // --- Server State Reconciliation --- -> Now handled within useFrame
  // useEffect(() => {
  //   if (!isLocalPlayer || !modelLoaded) return; 

  //   // Update internal ref used by useFrame
  //   dataRef.current = playerData;

  // }, [playerData, isLocalPlayer, modelLoaded]);

  // Set up pointer lock for camera control if local player
  useEffect(() => {
    if (!isLocalPlayer) return;
    
    const handlePointerLockChange = () => {
      isPointerLocked.current = document.pointerLockElement === document.body;
      // Add cursor style changes to match legacy implementation
      if (isPointerLocked.current) {
        document.body.classList.add('cursor-locked');
      } else {
        document.body.classList.remove('cursor-locked');
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPointerLocked.current || !isLocalPlayer) return;
      
      if (cameraMode === CAMERA_MODES.FOLLOW) {
        // Update LOCAL rotation ref based on mouse movement for player rotation
        const sensitivity = 0.003;
        localRotationRef.current.y -= e.movementX * sensitivity;
        
        // Keep angle within [-PI, PI] for consistency
        localRotationRef.current.y = THREE.MathUtils.euclideanModulo(localRotationRef.current.y + Math.PI, 2 * Math.PI) - Math.PI;

        // Call the rotation change callback if provided (using local ref)
        if (onRotationChange) {
          onRotationChange(localRotationRef.current);
        }
      } else if (cameraMode === CAMERA_MODES.ORBITAL) {
        // In orbital mode, mouse movement controls the camera angle around the player
        const orbital = orbitalCameraRef.current;
        const sensitivity = 0.005;
        
        // X movement rotates camera around player
        orbital.angle -= e.movementX * sensitivity;
        
        // Y movement controls camera elevation/height
        orbital.elevation += e.movementY * sensitivity;
        
        // Clamp elevation between reasonable limits (15° to 85°)
        orbital.elevation = Math.max(Math.PI / 12, Math.min(Math.PI / 2.1, orbital.elevation));
      }
    };
    
    const handleMouseWheel = (e: WheelEvent) => {
      if (!isLocalPlayer) return;
      
      if (cameraMode === CAMERA_MODES.FOLLOW) {
        // Follow camera zoom
        const zoomSpeed = 0.8; // Match legacy zoom speed
        const zoomChange = Math.sign(e.deltaY) * zoomSpeed;
        const minZoom = 2.0; // Closest zoom
        const maxZoom = 12.0; // Furthest zoom allowed
        targetZoom.current = Math.max(minZoom, Math.min(maxZoom, zoomLevel.current + zoomChange));
      } else if (cameraMode === CAMERA_MODES.ORBITAL) {
        // Orbital camera zoom
        const orbital = orbitalCameraRef.current;
        const zoomSpeed = 0.5;
        const zoomChange = Math.sign(e.deltaY) * zoomSpeed;
        
        // Adjust orbital distance
        orbital.distance = Math.max(3, Math.min(20, orbital.distance + zoomChange));
      }
    };
    
    // Request pointer lock on click
    const handleCanvasClick = () => {
      if (!isPointerLocked.current) {
        document.body.requestPointerLock();
      }
    };
    
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('wheel', handleMouseWheel);
    document.addEventListener('click', handleCanvasClick);
    
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('wheel', handleMouseWheel);
      document.removeEventListener('click', handleCanvasClick);
    };
  }, [isLocalPlayer, onRotationChange, cameraMode]);

  // Handle one-time animation completion
  useEffect(() => {
    // Explicitly wrap hook body
    {
      if (
        mixer &&
        animations[currentAnimation] &&
        (currentAnimation === ANIMATIONS.JUMP ||
         currentAnimation === ANIMATIONS.ATTACK ||
         currentAnimation === ANIMATIONS.CAST)
      ) {
        const action = animations[currentAnimation];
        
        // Ensure action exists and has a clip
        if (!action || !action.getClip()) return;
        
        const duration = action.getClip().duration;
        
        // Define the listener function
        const onFinished = (event: any) => {
          // Only act if the finished action is the one we are tracking
          if (event.action === action) {
             // dlog(`Animation finished: ${currentAnimation}. Playing idle.`);
             playAnimation(ANIMATIONS.IDLE, 0.1); // Faster transition back to idle
             mixer.removeEventListener('finished', onFinished); // Remove listener
          }
        };
        
        // Add the listener
        mixer.addEventListener('finished', onFinished);

        // Cleanup function to remove listener if component unmounts or animation changes
        return () => {
          if (mixer) {
            mixer.removeEventListener('finished', onFinished);
          }
        };
      }
    }
  }, [currentAnimation, animations, mixer, playAnimation]); // Ensure all dependencies are listed

  // --- Handle Camera Toggle ---
  const toggleCameraMode = useCallback(() => {
    const newMode = cameraMode === CAMERA_MODES.FOLLOW ? CAMERA_MODES.ORBITAL : CAMERA_MODES.FOLLOW;
    setCameraMode(newMode);
    
    // Store player's facing direction when entering orbital mode
    if (newMode === CAMERA_MODES.ORBITAL) {
      // Use the current reconciled rotation from the ref
      orbitalCameraRef.current.playerFacingRotation = localRotationRef.current.y;
      dlog(`[Orbital Toggle] Storing playerFacingRotation: ${orbitalCameraRef.current.playerFacingRotation.toFixed(3)}`); // DEBUG
      // Set the initial orbital angle to match the player's facing direction
      orbitalCameraRef.current.angle = localRotationRef.current.y;
      // Reset elevation to a default value for a consistent starting view
      orbitalCameraRef.current.elevation = Math.PI / 6; 
      
      // Log the stored rotation for debugging
      dlog(`Entering orbital mode. Stored player rotation: ${(localRotationRef.current.y * (180/Math.PI)).toFixed(2)}°`);
    }
    
    dlog(`Camera mode toggled to: ${newMode}`);
  }, [cameraMode]); // localRotationRef is not a state/prop, so not needed here

  // Set up keyboard handlers for camera toggling
  useEffect(() => {
    if (!isLocalPlayer) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Toggle camera mode on 'C' key press
      if (event.code === 'KeyC' && !event.repeat) { // Check for !event.repeat
        toggleCameraMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocalPlayer, toggleCameraMode]);

  // Update the useFrame hook to handle both camera modes and reconciliation
  useFrame((state, delta) => {
    {
      const dt = Math.min(delta, 1 / 30);

      // --- Parent Check & Position Log --- 
      if (pointLightRef.current && group.current && Math.random() < 0.01) { 
        const lightWorldPos = new THREE.Vector3();
        const groupWorldPos = new THREE.Vector3();
        pointLightRef.current.getWorldPosition(lightWorldPos);
        group.current.getWorldPosition(groupWorldPos);

        /*if (pointLightRef.current.parent !== group.current) {
          derror(`[Player Frame ${playerData.username}] Light parent mismatch!`);
        } else {
          // Log world positions for comparison
          dlog(`[Player Frame ${playerData.username}] Group World: (${groupWorldPos.x.toFixed(2)}, ${groupWorldPos.y.toFixed(2)}, ${groupWorldPos.z.toFixed(2)}), Light World: (${lightWorldPos.x.toFixed(2)}, ${lightWorldPos.y.toFixed(2)}, ${lightWorldPos.z.toFixed(2)})`);
        }*/
      }
      // --- END LOG --- 

      // Update latest server data ref for local player
      if (isLocalPlayer) {
          dataRef.current = playerData;
      }

      if (group.current && modelLoaded) {
        const currentInput = currentInputRef?.current;
        if (isLocalPlayer && currentInput) {
          // --- LOCAL PLAYER PREDICTION & RECONCILIATION ---

          // 1. Calculate predicted position based on current input and actual frame delta
          const predictedPosition = calculateClientMovement(
            localPositionRef.current,
            localRotationRef.current,
            currentInput,
            dt
          );
          localPositionRef.current.copy(predictedPosition);

          // 2. RECONCILIATION (Position)
          const serverPosition = new THREE.Vector3(dataRef.current.position.x, dataRef.current.position.y, dataRef.current.position.z);

          const positionError = localPositionRef.current.distanceTo(serverPosition);
          
          if (positionError > POSITION_RECONCILE_THRESHOLD) {
            // Temporarily disable LERP in orbital mode to test if reconciliation is the issue
            if (cameraMode !== CAMERA_MODES.ORBITAL) {
                localPositionRef.current.lerp(serverPosition, RECONCILE_LERP_FACTOR);
            }
          }

          // 2.5 RECONCILIATION (Rotation) 
          const serverRotation = new THREE.Euler(0, dataRef.current.rotation.y, 0, 'YXZ');
          const reconcileTargetQuat = new THREE.Quaternion().setFromEuler(serverRotation);
          const currentQuat = new THREE.Quaternion().setFromEuler(localRotationRef.current);
          const rotationError = currentQuat.angleTo(reconcileTargetQuat);
          
          if (rotationError > ROTATION_RECONCILE_THRESHOLD) {
              currentQuat.slerp(reconcileTargetQuat, RECONCILE_LERP_FACTOR);
              localRotationRef.current.setFromQuaternion(currentQuat, 'YXZ');
          }

          // 3. Apply potentially reconciled predicted position AND reconciled local rotation directly to the model group
          group.current.position.copy(localPositionRef.current);
          // --- Visual Rotation Logic --- 
          let targetVisualYaw = localRotationRef.current.y; // Default: Face camera/mouse direction

          if (cameraMode === CAMERA_MODES.FOLLOW) {
              const { forward, backward, left, right } = currentInput;
              const isMovingDiagonally = (forward || backward) && (left || right);

              if (isMovingDiagonally) {
                  let localMoveX = 0;
                  let localMoveZ = 0;
                  if (forward) localMoveZ -= 1;
                  if (backward) localMoveZ += 1;
                  if (left) localMoveX -= 1;
                  if (right) localMoveX += 1;
                  const localMoveVector = new THREE.Vector3(localMoveX, 0, localMoveZ).normalize(); 
                  const cameraYaw = localRotationRef.current.y;
                  const worldMoveDirection = localMoveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);

                  // Calculate the base target yaw
                  targetVisualYaw = Math.atan2(worldMoveDirection.x, worldMoveDirection.z);

                  // --- Reverse yaw ONLY for FORWARD diagonal movement ---
                  if (forward && !backward) { // Check if primary movement is forward
                      targetVisualYaw += Math.PI; // Add 180 degrees
                  }
                  // --- End reversal --- 
              }
          } else { // ORBITAL MODE
              // --- Apply diagonal rotation logic similar to FOLLOW mode --- 
              const { forward, backward, left, right } = currentInput;
              const isMovingDiagonally = (forward || backward) && (left || right);

              if (isMovingDiagonally) {
                  // Calculate local movement vector (Orbital mapping: W=+z, S=-z, A=+x, D=-x)
                  let localMoveX = 0;
                  let localMoveZ = 0;
                  if (forward) localMoveZ += 1;
                  if (backward) localMoveZ -= 1; // Corrected backward direction for orbital local
                  if (left) localMoveX += 1; // Corrected left direction for orbital local
                  if (right) localMoveX -= 1; // Corrected right direction for orbital local
                  const localMoveVector = new THREE.Vector3(localMoveX, 0, localMoveZ).normalize();

                  // Rotate local movement by the FIXED orbital yaw to get world direction
                  const fixedOrbitalYaw = orbitalCameraRef.current.playerFacingRotation;
                  const worldMoveDirection = localMoveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), fixedOrbitalYaw);

                  // Calculate base target yaw
                  targetVisualYaw = Math.atan2(worldMoveDirection.x, worldMoveDirection.z);

                  // --- RE-ADD Condition: Reverse yaw ONLY for FORWARD diagonal movement --- 
                  if (!forward && backward) { 
                      targetVisualYaw += Math.PI; // Add 180 degrees
                  }
                  // --- End conditional reversal --- 
                  
              } else {
                   // If not moving diagonally, face the fixed rotation
                   targetVisualYaw = orbitalCameraRef.current.playerFacingRotation;
              }
              // --- End diagonal rotation logic for ORBITAL ---
          }

          // --- Apply Rotation using Slerp --- 
          const targetVisualRotation = new THREE.Euler(0, targetVisualYaw, 0, 'YXZ');
          const targetVisualQuat = new THREE.Quaternion().setFromEuler(targetVisualRotation);
          
          // Interpolate the group's quaternion towards the target
          group.current.quaternion.slerp(targetVisualQuat, Math.min(1, dt * 10)); 

          // --- DEBUG: Draw/Update Directional Arrow (Conditional) ---
          const scene = group.current?.parent; // Get scene reference
          if (isDebugArrowVisible && scene) { // Only proceed if prop is true and scene exists
            const playerWorldPos = group.current.position;
            const playerWorldRotY = group.current.rotation.y; 
            const forwardDirection = new THREE.Vector3(Math.sin(playerWorldRotY), 0, Math.cos(playerWorldRotY)).normalize();
            const arrowLength = 3;
            const arrowColor = 0xff0000;

            if (debugArrowRef.current) {
              // Update existing arrow
              debugArrowRef.current.position.copy(playerWorldPos).add(new THREE.Vector3(0, 0.5, 0)); // Adjust origin height
              debugArrowRef.current.setDirection(forwardDirection);
              // Ensure it's visible if it was hidden
              debugArrowRef.current.visible = true; 
            } else {
              // Create new arrow
              debugArrowRef.current = new THREE.ArrowHelper(
                forwardDirection,
                playerWorldPos.clone().add(new THREE.Vector3(0, 0.5, 0)), // Adjust origin height
                arrowLength,
                arrowColor
              );
              debugArrowRef.current.userData.isDebugArrow = true; // Mark for potential future identification
              scene.add(debugArrowRef.current);
              dlog("[Debug Arrow] Created arrow."); // Log creation
            }
          } else {
            // Remove arrow if it exists and shouldn't be visible
            if (debugArrowRef.current && debugArrowRef.current.parent) {
               dlog("[Debug Arrow] Removing arrow (prop is false or no scene)."); // Log removal
               debugArrowRef.current.parent.remove(debugArrowRef.current);
               debugArrowRef.current = null;
            }
          }
          // --- END DEBUG ---

        } else { // Not the local player anymore or initially
          // If this instance stops being the local player OR debug visibility is off, ensure arrow is removed
          if (debugArrowRef.current && debugArrowRef.current.parent) {
               dlog("[Debug Arrow] Removing arrow (not local player)."); // Log removal
               debugArrowRef.current.parent.remove(debugArrowRef.current);
               debugArrowRef.current = null;
          }
          // --- REMOTE PLAYER INTERPOLATION --- 
          const serverPosition = new THREE.Vector3(playerData.position.x, playerData.position.y, playerData.position.z);
          const targetRotation = new THREE.Euler(0, playerData.rotation.y, 0, 'YXZ');

          // Interpolate position smoothly
          group.current.position.lerp(serverPosition, Math.min(1, dt * 10));

          // Interpolate rotation smoothly (using quaternions for better slerp)
          group.current.quaternion.slerp(
            new THREE.Quaternion().setFromEuler(targetRotation),
            Math.min(1, dt * 8)
          );
        }
      }

      // --- CAMERA UPDATE (Local Player Only) ---
      if (isLocalPlayer && group.current) {
        // Smooth zoom interpolation for follow camera
        if (cameraMode === CAMERA_MODES.FOLLOW) {
          zoomLevel.current += (targetZoom.current - zoomLevel.current) * Math.min(1, dt * 6);
        }

        // Get reconciled player position and rotation for camera
        const playerPosition = localPositionRef.current; 
        // Use the reconciled localRotationRef for camera calculations
        const playerRotationY = localRotationRef.current.y; 

        if (cameraMode === CAMERA_MODES.FOLLOW) {
          // --- FOLLOW CAMERA MODE (spring trail) --- 
          const cameraHeight = 2.6;
          const currentDistance = zoomLevel.current;

          // Calculate camera position based on player rotation and distance
          const targetPosition = new THREE.Vector3(
            playerPosition.x - Math.sin(playerRotationY) * currentDistance,
            playerPosition.y + cameraHeight,
            playerPosition.z - Math.cos(playerRotationY) * currentDistance 
          );

          // Smoothly trail the camera towards the target (lower damping = softer spring).
          const cameraDamping = 6.5;
          camera.position.lerp(targetPosition, Math.min(1, dt * cameraDamping));

          // Smoothly interpolate the look-at target too, so quick turns don't snap.
          const desiredLook = playerPosition.clone().add(new THREE.Vector3(0, 1.8, 0));
          if (!cameraInitializedRef.current) {
            cameraLookRef.current.copy(desiredLook);
            cameraInitializedRef.current = true;
          }
          cameraLookRef.current.lerp(desiredLook, Math.min(1, dt * 9));
          camera.lookAt(cameraLookRef.current);
        } else if (cameraMode === CAMERA_MODES.ORBITAL) {
          // --- ORBITAL CAMERA MODE ---
          const orbital = orbitalCameraRef.current;
          
          // Calculate orbital camera position using spherical coordinates
          const horizontalDistance = orbital.distance * Math.cos(orbital.elevation);
          const height = orbital.distance * Math.sin(orbital.elevation);
          
          // Use orbital.angle for camera rotation, playerPosition for center
          const orbitX = playerPosition.x + Math.sin(orbital.angle) * horizontalDistance;
          const orbitY = playerPosition.y + height;
          const orbitZ = playerPosition.z + Math.cos(orbital.angle) * horizontalDistance;
          
          // Set camera position based on orbital calculations
          const targetPosition = new THREE.Vector3(orbitX, orbitY, orbitZ);
          
          // Smoothly move camera
          const cameraDamping = 8; // Responsive but still smooth
          camera.position.lerp(targetPosition, Math.min(1, dt * cameraDamping));
          
          // Look at player
          const lookTarget = playerPosition.clone().add(new THREE.Vector3(0, 1.5, 0)); 
          camera.lookAt(lookTarget);
        }
      }

      // --- Update Animation Mixer ---
      if (mixer) {
        mixer.update(dt); // Mixer still uses actual frame delta (dt)
      }
    }
  });

  // --- Animation Triggering based on Server State ---
  useEffect(() => {
    // Explicitly wrap hook body
    {
      // Only update animations if mixer and animations exist
      if (!mixer || Object.keys(animations).length === 0) {
        return;
      }

      const serverAnim = playerData.currentAnimation;

      // dlog(`[Anim Check] Received ServerAnim: ${serverAnim}, Current LocalAnim: ${currentAnimation}, Is Available: ${!!animations[serverAnim]}`);

      // Play animation if it's different and available
      if (serverAnim && serverAnim !== currentAnimation && animations[serverAnim]) {
         // dlog(`[Anim Play] Server requested animation change to: ${serverAnim}`);
        try {
          playAnimation(serverAnim, 0.2);
        } catch (error) {
          derror(`[Anim Error] Error playing animation ${serverAnim}:`, error);
          // Attempt to fallback to idle if error occurs and not already idle
          if (animations['idle'] && currentAnimation !== 'idle') {
            playAnimation('idle', 0.2);
          }
        }
      } else if (serverAnim && !animations[serverAnim]) {
         // Log if server requests an animation we don't have loaded
         // dwarn(`[Anim Warn] Server requested unavailable animation: ${serverAnim}. Available: ${Object.keys(animations).join(', ')}`);
      }
    }
  }, [playerData.currentAnimation, animations, mixer, playAnimation, currentAnimation]); // Dependencies include things that trigger animation changes

  return (
    <group ref={group} castShadow>
      {/* Declarative PointLight */}
      <pointLight 
        ref={pointLightRef} 
        position={[0, -0.5, 0]} // Lowered position further
        color={0xffccaa} 
        intensity={2.5} // Increased intensity
        distance={5} 
        decay={2} 
        castShadow={false} 
      />

      {/* Debug Marker Sphere */}
      <Sphere 
        args={[0.1, 16, 16]} 
        position={[0, -0.5, 0]} // Match the new light position
        visible={isDebugPanelVisible} 
      >
        <meshBasicMaterial color="red" wireframe /> 
      </Sphere>

      {/* Model added dynamically */}
      {/* Name tag */}
      {model && (
        <Html position={[0, 2.5, 0]} center distanceFactor={10}>
            <div className="nametag">
            <div className="nametag-text">{playerData.username}</div>
            <div className="nametag-class">{characterClass}</div>
            </div>
        </Html>
      )}
    </group>
  );
}; 