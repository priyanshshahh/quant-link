import React, { useMemo } from 'react';
import { Box, Cylinder, Text, Float, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { MarketAsset } from '../generated/types';

// ---------------------------------------------------------------------------
// QuantLink — GTA Vice City–style financial district
// Dusk neon palette: hot pink, cyan, purple, sunset orange.
// ---------------------------------------------------------------------------

// Bright Miami / Vice City daytime accents (art-deco neon trims)
const NEON = ['#ff5fa2', '#16d6ff', '#b06bff', '#ff9d3d', '#39e36b', '#ffd84d'];
// Pastel building façade palette — sunny, colorful, clean
const PASTEL = ['#ffd9e6', '#bfeeff', '#ffe9c2', '#d6f5dd', '#e8dcff', '#fff1c9', '#ffd2c2', '#cfefff'];

interface BuildingProps {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  neon?: string;
  label?: string;
  sublabel?: string;
  windows?: boolean;
}

function Building({ x, z, w, h, d, color, neon, label, sublabel, windows = true }: BuildingProps) {
  const accent = neon ?? '#00e5ff';
  return (
    <group position={[x, 0, z]}>
      {/* main tower — clean matte pastel façade */}
      <Box args={[w, h, d]} position={[0, h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
      </Box>

      {/* art-deco painted trim band near the roof (Vice City accent stripe) */}
      <Box args={[w + 0.12, 0.7, d + 0.12]} position={[0, h - 0.6, 0]}>
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.1} />
      </Box>
      {/* slim glowing neon roofline */}
      <Box args={[w + 0.16, 0.16, d + 0.16]} position={[0, h + 0.05, 0]}>
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} toneMapped={false} />
      </Box>

      {/* glass window bands on the front face */}
      {windows && (
        <Box args={[w * 0.82, h * 0.82, 0.06]} position={[0, h / 2, d / 2 + 0.05]}>
          <meshStandardMaterial color="#bfe9ff" roughness={0.15} metalness={0.6} />
        </Box>
      )}

      {label && (
        <Billboard position={[0, h + 1.4, 0]}>
          <Text fontSize={0.85} color={accent} anchorX="center" anchorY="bottom" outlineWidth={0.06} outlineColor="#000">
            {label}
          </Text>
          {sublabel && (
            <Text position={[0, -0.55, 0]} fontSize={0.4} color="#ffffff" anchorX="center" anchorY="top" outlineWidth={0.02} outlineColor="#000">
              {sublabel}
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );
}

function Car({ x, z, rot = 0, color }: { x: number; z: number; rot?: number; color: string }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* body */}
      <Box args={[1.8, 0.55, 4]} position={[0, 0.55, 0]} castShadow>
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </Box>
      {/* cabin */}
      <Box args={[1.6, 0.5, 2]} position={[0, 1.05, -0.2]} castShadow>
        <meshStandardMaterial color="#10131c" metalness={0.4} roughness={0.2} />
      </Box>
      {/* wheels */}
      {[[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]].map(([wx, wz], i) => (
        <Cylinder key={i} args={[0.35, 0.35, 0.3, 12]} rotation={[0, 0, Math.PI / 2]} position={[wx, 0.35, wz]}>
          <meshStandardMaterial color="#0a0a0a" />
        </Cylinder>
      ))}
      {/* tail lights */}
      <Box args={[1.6, 0.18, 0.1]} position={[0, 0.6, 2]}>
        <meshStandardMaterial color="#ff1133" emissive="#ff1133" emissiveIntensity={2} toneMapped={false} />
      </Box>
      {/* head lights */}
      <Box args={[1.6, 0.18, 0.1]} position={[0, 0.6, -2]}>
        <meshStandardMaterial color="#fff4cc" emissive="#fff4cc" emissiveIntensity={2} toneMapped={false} />
      </Box>
    </group>
  );
}

function PalmTree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Cylinder args={[0.18, 0.28, 4.5, 8]} position={[0, 2.25, 0]} castShadow>
        <meshStandardMaterial color="#6b4f2a" roughness={1} />
      </Cylinder>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.1, 4.4, Math.sin(a) * 1.1]} rotation={[Math.PI / 5, a, 0]} castShadow>
            <coneGeometry args={[0.35, 2.4, 4]} />
            <meshStandardMaterial color="#1f8b2f" roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

function StreetLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Cylinder args={[0.08, 0.1, 6]} position={[0, 3, 0]}>
        <meshStandardMaterial color="#222" metalness={0.8} />
      </Cylinder>
      <mesh position={[0, 6, 0]}>
        <sphereGeometry args={[0.25]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffb347" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 6, 0]} intensity={18} distance={16} color="#ffb347" />
    </group>
  );
}

function Road({ x, z, w, d, rot = 0 }: { x: number; z: number; w: number; d: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#41434c" roughness={1} />
      </mesh>
      {/* center dashed line */}
      {Array.from({ length: Math.floor(d / 4) }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -d / 2 + 2 + i * 4]}>
          <planeGeometry args={[0.25, 2]} />
          <meshStandardMaterial color="#ffd400" emissive="#ffd400" emissiveIntensity={0.4} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function TickerBoard({ assets, x, z }: { assets: MarketAsset[]; x: number; z: number }) {
  const text = assets.slice(0, 6).map((a) => {
    const chg = ((a.currentPrice - a.previousPrice) / a.previousPrice) * 100;
    const sign = chg >= 0 ? '+' : '';
    return `${a.ticker} $${a.currentPrice.toFixed(0)} ${sign}${chg.toFixed(1)}%`;
  }).join('     •     ');

  return (
    <group position={[x, 11, z]}>
      <Box args={[18, 1.6, 0.3]}>
        <meshStandardMaterial color="#05080f" emissive="#001a33" emissiveIntensity={0.6} />
      </Box>
      <Billboard>
        <Text position={[0, 0, 0.2]} fontSize={0.5} color="#00ff88" anchorX="center" anchorY="middle" maxWidth={17}>
          {text || 'QUANTLINK MARKET DATA  •  LOADING...'}
        </Text>
      </Billboard>
    </group>
  );
}

interface FinancialCityProps {
  marketAssets: MarketAsset[];
}

export const FinancialCity: React.FC<FinancialCityProps> = ({ marketAssets }) => {
  // Procedurally place a dense backdrop skyline ring so it feels like a real city.
  const skyline = useMemo(() => {
    const blocks: BuildingProps[] = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let ring = 0; ring < 60; ring++) {
      const angle = rand() * Math.PI * 2;
      const radius = 48 + rand() * 55;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 8;
      const h = 12 + rand() * 40;
      const w = 5 + rand() * 6;
      const d = 5 + rand() * 6;
      blocks.push({
        x, z, w, h, d,
        color: PASTEL[Math.floor(rand() * PASTEL.length)],
        neon: NEON[Math.floor(rand() * NEON.length)],
        windows: true,
      });
    }
    return blocks;
  }, []);

  const cars = useMemo(() => {
    const list: { x: number; z: number; rot: number; color: string }[] = [];
    const carColors = ['#ff2d95', '#00e5ff', '#ffd400', '#ff4444', '#39ff14', '#ffffff', '#b14bff'];
    // cars along the main boulevard
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -2.5 : 2.5;
      list.push({ x: side, z: -25 + i * 6, rot: 0, color: carColors[i % carColors.length] });
    }
    // cars along the cross street
    for (let i = 0; i < 5; i++) {
      list.push({ x: -28 + i * 11, z: 8, rot: Math.PI / 2, color: carColors[(i + 3) % carColors.length] });
    }
    return list;
  }, []);

  return (
    <group>
      {/* ===================== GROUND ===================== */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#7fb86b" roughness={1} />
      </mesh>

      {/* City block sidewalks (light concrete) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, -10]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#cfcabc" roughness={1} />
      </mesh>

      {/* ===================== ROADS ===================== */}
      <Road x={0} z={-8} w={11} d={100} />
      <Road x={0} z={8} w={120} d={11} rot={Math.PI / 2} />
      <Road x={-34} z={-8} w={9} d={100} />
      <Road x={34} z={-8} w={9} d={100} />
      <Road x={0} z={-32} w={120} d={9} rot={Math.PI / 2} />

      {/* Neon crosswalk glow strips at the central intersection */}
      {[-6, 6].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, z]}>
          <planeGeometry args={[11, 0.4]} />
          <meshStandardMaterial color="#ff2d95" emissive="#ff2d95" emissiveIntensity={1} toneMapped={false} />
        </mesh>
      ))}

      {/* ===================== BEACH + OCEAN (Vice City) ===================== */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[78, 0.0, -8]} receiveShadow>
        <planeGeometry args={[40, 200]} />
        <meshStandardMaterial color="#d9c79a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[120, -0.3, -8]}>
        <planeGeometry args={[80, 240]} />
        <meshStandardMaterial color="#0a4d6b" emissive="#0d6b94" emissiveIntensity={0.35} metalness={0.5} roughness={0.2} transparent opacity={0.92} />
      </mesh>

      {/* ===================== LANDMARK: EXCHANGE (press T) ===================== */}
      <Building x={0} z={-18} w={12} h={20} d={9} color="#bfeeff" neon="#16d6ff" label="QUANTLINK EXCHANGE" sublabel="◆ Press T to Trade ◆" />
      {/* glowing entrance beam */}
      <Box args={[2, 22, 2]} position={[0, 11, -13]}>
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={2} toneMapped={false} transparent opacity={0.85} />
      </Box>
      <Float speed={2} floatIntensity={0.5}>
        <Billboard position={[0, 24, -13]}>
          <Text fontSize={2} color="#00e5ff" anchorX="center" outlineWidth={0.06} outlineColor="#000">$</Text>
        </Billboard>
      </Float>
      <pointLight position={[0, 6, -13]} intensity={40} distance={28} color="#00e5ff" />

      {/* ===================== LANDMARK: MENTOR HQ (press E) ===================== */}
      <Building x={-18} z={12} w={9} h={14} d={8} color="#e8dcff" neon="#b06bff" label="SENIOR QUANT HQ" sublabel="◆ Press E for AI Mentor ◆" />
      <Float speed={1.6} floatIntensity={0.5}>
        <Billboard position={[-18, 17, 16]}>
          <Text fontSize={1.6} color="#b14bff" anchorX="center" outlineWidth={0.06} outlineColor="#000">🧠</Text>
        </Billboard>
      </Float>
      <pointLight position={[-18, 6, 16]} intensity={35} distance={26} color="#b14bff" />

      {/* ===================== NAMED FINANCIAL TOWERS ===================== */}
      <Building x={-15} z={-26} w={7} h={30} d={6} color="#cfe9ff" neon="#16d6ff" label="JPM TOWER" />
      <Building x={15} z={-26} w={6} h={34} d={6} color="#d6f5dd" neon="#39e36b" label="NVIDIA HQ" />
      <Building x={-26} z={-6} w={8} h={18} d={7} color="#fff1c9" neon="#ffd84d" label="CRYPTO VAULT" sublabel="BTC / ETH" />
      <Building x={26} z={-6} w={7} h={22} d={6} color="#d6f5dd" neon="#39e36b" label="GREEN FUND" />
      <Building x={-16} z={-44} w={9} h={11} d={8} color="#ffe9c2" neon="#ff9d3d" label="LUXURY MOTORS" sublabel="Buy Vehicles (Life tab)" />
      <Building x={18} z={-44} w={8} h={9} d={7} color="#ffd9e6" neon="#ff5fa2" label="OCEAN PENTHOUSE" sublabel="Real Estate (Life tab)" />
      <Building x={-30} z={26} w={8} h={8} d={7} color="#e8dcff" neon="#b06bff" label="VIP NIGHTCLUB" />
      <Building x={30} z={24} w={10} h={7} d={12} color="#bfeeff" neon="#16d6ff" label="YACHT MARINA" />
      <Building x={16} z={20} w={7} h={12} d={6} color="#ffd2c2" neon="#ff5fa2" label="HEDGE FUND" />
      <Building x={-15} z={22} w={7} h={10} d={6} color="#fff1c9" neon="#ffd84d" label="OPTIONS DESK" />

      {/* Procedural skyline backdrop */}
      {skyline.map((b, i) => <Building key={`sky-${i}`} {...b} />)}

      {/* ===================== CARS ===================== */}
      {cars.map((c, i) => <Car key={`car-${i}`} {...c} />)}

      {/* ===================== PALMS + LAMPS ===================== */}
      {[[-7, -2], [7, -2], [-7, 18], [7, 18], [-7, -22], [7, -22], [70, -20], [70, 0], [70, 20], [70, -40], [-7, 30], [7, 30]].map(([x, z], i) => (
        <PalmTree key={`palm-${i}`} x={x} z={z} />
      ))}
      {[[-6.5, -12], [6.5, -12], [-6.5, 2], [6.5, 2], [-6.5, 16], [6.5, 16], [-6.5, -28], [6.5, -28]].map(([x, z], i) => (
        <StreetLamp key={`lamp-${i}`} x={x} z={z} />
      ))}

      {/* ===================== LIVE TICKER ===================== */}
      <TickerBoard assets={marketAssets} x={0} z={-13.5} />

      {/* ===================== SPAWN SIGNAGE ===================== */}
      <Billboard position={[0, 5, 6]}>
        <Text fontSize={0.95} color="#ff2d95" anchorX="center" outlineWidth={0.05} outlineColor="#000">
          WELCOME TO QUANTLINK CITY
        </Text>
        <Text position={[0, -1.05, 0]} fontSize={0.4} color="#ffffff" anchorX="center" outlineWidth={0.02} outlineColor="#000">
          WASD to move · Mouse to look · North → Exchange (T) · West → AI Mentor (E)
        </Text>
        <Text position={[0, -1.7, 0]} fontSize={0.42} color="#00e5ff" anchorX="center" outlineWidth={0.02} outlineColor="#000">
          Press Q for your Career Objectives 🎯
        </Text>
      </Billboard>

      {/* glowing arrow on the ground pointing to the Exchange */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -2]}>
        <planeGeometry args={[1.6, 5]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.8} toneMapped={false} transparent opacity={0.7} />
      </mesh>
    </group>
  );
};
