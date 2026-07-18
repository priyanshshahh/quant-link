/**
 * GameScene.tsx — React Three Fiber Canvas containing the 3D game world.
 * Renders sky, lighting, ground plane, grid, and all Player entities.
 * Debug helpers (light/shadow camera) toggle with isDebugPanelVisible.
 */

import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars, Environment, SoftShadows, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { DirectionalLightHelper, CameraHelper } from 'three';
import { PlayerData, InputState, MarketAsset } from '../generated/types';
import { Identity } from 'spacetimedb';
import { Player } from './Player';
import { FinancialCity } from './FinancialCity';

interface GameSceneProps {
  players: ReadonlyMap<string, PlayerData>;
  localPlayerIdentity: Identity | null;
  marketAssets: MarketAsset[];
  onPlayerRotation?: (rotation: THREE.Euler) => void;
  currentInputRef?: React.MutableRefObject<InputState>;
  isDebugPanelVisible?: boolean;
}

export const GameScene: React.FC<GameSceneProps> = ({ 
  players, 
  localPlayerIdentity,
  marketAssets,
  onPlayerRotation,
  currentInputRef,
  isDebugPanelVisible = false,
}) => {
  // Ref for the main directional light
  const directionalLightRef = useRef<THREE.DirectionalLight>(null!); 

  return (
    <Canvas 
      camera={{ position: [0, 10, 20], fov: 60 }} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} 
      shadows
      gl={{ antialias: true, toneMappingExposure: 1.1 }}
      dpr={[1, 1.75]}
    >
      {/* Deep cyberpunk night — dark base so the neon bloom reads intensely */}
      <fog attach="fog" args={['#070310', 60, 260]} />
      <color attach="background" args={['#05030d']} />

      {/* Soft contact shadows so cars/character feel grounded, not floating */}
      <SoftShadows size={28} samples={16} focus={0.85} />

      {/* Night HDRI for realistic reflections on glassy buildings + car bodies */}
      <Environment preset="night" resolution={256} />

      {/* Dim starfield dome */}
      <Stars radius={340} depth={90} count={2400} factor={6} saturation={0.5} fade speed={0.5} />

      {/* Low ambient — night scene relies on neon + key light, not flat fill */}
      <ambientLight intensity={0.25} color="#5b6bff" />
      <hemisphereLight args={['#3a2a6a', '#0a0612', 0.4]} />

      {/* Cool moonlight key with soft shadows */}
      <directionalLight 
        ref={directionalLightRef}
        position={[-28, 40, -18]} 
        color="#9fb8ff"
        intensity={1.6} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={0.1}
        shadow-camera-far={220}
      />

      {/* Magenta + cyan neon rim fill (Vice City night) */}
      <directionalLight position={[26, 14, 20]} color="#ff2d95" intensity={0.5} />
      <directionalLight position={[8, 10, -30]} color="#16d6ff" intensity={0.45} />

      {/* Conditionally render Light and Shadow Camera Helpers */}
      {isDebugPanelVisible && directionalLightRef.current && (
        <>
          <primitive object={new DirectionalLightHelper(directionalLightRef.current, 5)} />
          {/* Add CameraHelper for the shadow camera */}
          <primitive object={new CameraHelper(directionalLightRef.current.shadow.camera)} /> 
        </>
      )}
      
      <FinancialCity marketAssets={marketAssets} />

      {/* Soft contact shadows across the central streets so characters + cars
          read as grounded on the floor (updates every frame as they move). */}
      {/* frames={60} bakes the contact-shadow pass over the first ~60 frames
          then freezes it, instead of re-rendering the whole shadow scene every
          single frame (frames={Infinity}). Moving characters/cars still get
          real-time shadows from the directional key light; this pass only adds
          soft ground contact, which is fine to bake once. */}
      <ContactShadows
        position={[0, 0.03, -8]}
        scale={130}
        resolution={1024}
        blur={2.6}
        far={6}
        opacity={0.65}
        color="#01040a"
        frames={60}
      />

      {/* Render Players */}
      {Array.from(players.values()).map((player) => {
        const isLocal = localPlayerIdentity?.toHexString() === player.identity.toHexString();
        return (
          <Player 
            key={player.identity.toHexString()} 
            playerData={player}
            isLocalPlayer={isLocal}
            onRotationChange={isLocal ? onPlayerRotation : undefined}
            currentInputRef={isLocal ? currentInputRef : undefined}
            isDebugArrowVisible={isLocal ? isDebugPanelVisible : false} // Pass down arrow visibility
            isDebugPanelVisible={isDebugPanelVisible} // Pass down general debug visibility
          />
        );
      })}

      {/* ---- POST-PROCESSING: bloom makes HDR neon glow against the dark night ---- */}
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.22}
          mipmapBlur
          radius={0.85}
        />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
};
