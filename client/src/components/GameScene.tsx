/**
 * GameScene.tsx — React Three Fiber Canvas containing the 3D game world.
 * Renders sky, lighting, ground plane, grid, and all Player entities.
 * Debug helpers (light/shadow camera) toggle with isDebugPanelVisible.
 */

import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Cloud, Clouds } from '@react-three/drei';
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
    >
      {/* Bright Miami daytime sky — sun high for clear, vibrant lighting */}
      <Sky distance={450000} sunPosition={[60, 35, 20]} inclination={0.49} azimuth={0.25} mieCoefficient={0.004} mieDirectionalG={0.8} rayleigh={1.1} turbidity={6} />
      <fog attach="fog" args={['#aee4ff', 160, 420]} />
      <color attach="background" args={['#9fd8ff']} />

      {/* Soft drifting clouds for a sunny coastal feel */}
      <Clouds material={THREE.MeshBasicMaterial} limit={40}>
        <Cloud seed={1} segments={28} bounds={[60, 6, 30]} volume={14} color="#ffffff" opacity={0.55} position={[-30, 55, -40]} speed={0.15} />
        <Cloud seed={9} segments={24} bounds={[50, 5, 28]} volume={12} color="#eef6ff" opacity={0.5} position={[40, 62, -20]} speed={0.12} />
      </Clouds>

      {/* Strong, even daylight so every surface is clearly readable and colorful */}
      <ambientLight intensity={1.15} color="#ffffff" />
      <hemisphereLight args={['#bfe6ff', '#d9c39a', 1.25]} />

      {/* Warm sun key light with crisp shadows */}
      <directionalLight 
        ref={directionalLightRef}
        position={[40, 55, 25]} 
        color="#fff3da"
        intensity={2.6} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={0.1}
        shadow-camera-far={200}
      />

      {/* Cool sky bounce fill from the opposite side */}
      <directionalLight position={[-30, 20, -18]} color="#bfe6ff" intensity={0.55} />

      {/* Conditionally render Light and Shadow Camera Helpers */}
      {isDebugPanelVisible && directionalLightRef.current && (
        <>
          <primitive object={new DirectionalLightHelper(directionalLightRef.current, 5)} />
          {/* Add CameraHelper for the shadow camera */}
          <primitive object={new CameraHelper(directionalLightRef.current.shadow.camera)} /> 
        </>
      )}
      
      <FinancialCity marketAssets={marketAssets} />

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

      {/* Remove OrbitControls as we're using our own camera controls */}
    </Canvas>
  );
};
