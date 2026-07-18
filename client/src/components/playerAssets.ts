/**
 * playerAssets.ts — shared, cached character assets.
 *
 * Loading the FBX model + its ~14 animation files is expensive (one FBX parse
 * and GPU upload each). Previously every <Player> instance did this
 * independently, so N visible players cost 15 x N FBX loads — a real
 * multiplayer scaling hazard (see docs/CODE-AUDIT.md #4).
 *
 * This module loads each character class exactly once (module-level promise
 * cache) and hands back a template model + a map of processed AnimationClips.
 * Each <Player> then clones the rigged template with SkeletonUtils.clone (so
 * every instance animates independently) and builds its own mixer/actions from
 * the SHARED clips. Result: 15 x (distinct classes in the scene), not 15 x N.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { dlog, derror } from '../debug';

export interface CharacterAssets {
  /** Rigged template — clone per instance with SkeletonUtils.clone. */
  template: THREE.Group;
  /** Processed (in-place, named) clips, shared across all instances. */
  clips: Record<string, THREE.AnimationClip>;
}

type CharacterClass = 'Wizard' | 'Paladin';

const MODEL_PATH: Record<CharacterClass, string> = {
  Wizard: '/models/wizard/wizard.fbx',
  Paladin: '/models/paladin/paladin.fbx',
};

/** Per-class scale to normalise the two source rigs to game units. */
const MODEL_SCALE: Record<CharacterClass, number> = {
  Wizard: 0.02,
  Paladin: 1.0,
};

function animationFiles(characterClass: CharacterClass): Record<string, string> {
  const base = characterClass === 'Paladin' ? '/models/paladin/' : '/models/wizard/';
  const isWizard = characterClass === 'Wizard';
  const files: Record<string, string> = {
    idle: isWizard ? 'wizard-standing-idle.fbx' : 'paladin-idle.fbx',
    'walk-forward': isWizard ? 'wizard-standing-walk-forward.fbx' : 'paladin-walk-forward.fbx',
    'walk-back': isWizard ? 'wizard-standing-walk-back.fbx' : 'paladin-walk-back.fbx',
    'walk-left': isWizard ? 'wizard-standing-walk-left.fbx' : 'paladin-walk-left.fbx',
    'walk-right': isWizard ? 'wizard-standing-walk-right.fbx' : 'paladin-walk-right.fbx',
    'run-forward': isWizard ? 'wizard-standing-run-forward.fbx' : 'paladin-run-forward.fbx',
    'run-back': isWizard ? 'wizard-standing-run-back.fbx' : 'paladin-run-back.fbx',
    'run-left': isWizard ? 'wizard-standing-run-left.fbx' : 'paladin-run-left.fbx',
    'run-right': isWizard ? 'wizard-standing-run-right.fbx' : 'paladin-run-right.fbx',
    jump: isWizard ? 'wizard-standing-jump.fbx' : 'paladin-jump.fbx',
    attack1: isWizard ? 'wizard-standing-1h-magic-attack-01.fbx' : 'paladin-attack.fbx',
    cast: isWizard ? 'wizard-standing-2h-magic-area-attack-02.fbx' : 'paladin-cast.fbx',
    damage: isWizard ? 'wizard-standing-react-small-from-front.fbx' : 'paladin-damage.fbx',
    death: isWizard ? 'wizard-standing-react-death-backward.fbx' : 'paladin-death.fbx',
  };
  const out: Record<string, string> = {};
  for (const [name, file] of Object.entries(files)) out[name] = `${base}${file}`;
  return out;
}

/**
 * Strip root-motion position tracks so animations play in place (the character
 * is moved by the game, not the clip). Mutates the clip — safe here because
 * each clip is processed exactly once at load time before being shared.
 */
function makeAnimationInPlace(clip: THREE.AnimationClip): void {
  const positionTracks = clip.tracks.filter((t) => t.name.endsWith('.position'));
  if (positionTracks.length === 0) return;

  const rootNames = [
    'Hips.position', 'mixamorigHips.position', 'root.position',
    'Armature.position', 'Root.position',
  ];
  const rootTrack =
    positionTracks.find((t) =>
      rootNames.some((n) => t.name.toLowerCase().includes(n.toLowerCase())),
    ) ?? positionTracks[0];
  const rootBase = rootTrack.name.split('.')[0];

  clip.tracks = clip.tracks.filter((t) => !t.name.startsWith(`${rootBase}.position`));
}

function loadFbx(loader: FBXLoader, path: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

async function buildAssets(characterClass: CharacterClass): Promise<CharacterAssets> {
  const loader = new FBXLoader();

  const template = await loadFbx(loader, MODEL_PATH[characterClass]);
  template.scale.setScalar(MODEL_SCALE[characterClass]);
  // Remove any lights embedded in the source FBX (they otherwise multiply per
  // player and blow out the night scene).
  template.traverse((child) => {
    if (child instanceof THREE.Light) child.removeFromParent();
  });

  const files = animationFiles(characterClass);
  const clips: Record<string, THREE.AnimationClip> = {};

  await Promise.all(
    Object.entries(files).map(async ([name, path]) => {
      try {
        const animFbx = await loadFbx(loader, path);
        if (!animFbx.animations || animFbx.animations.length === 0) {
          derror(`No animation found in ${path}`);
          return;
        }
        const clip = animFbx.animations[0];
        clip.name = name;
        makeAnimationInPlace(clip);
        clips[name] = clip;
      } catch (e) {
        derror(`Failed to load animation "${name}" from ${path}:`, e);
      }
    }),
  );

  dlog(`[playerAssets] Loaded ${characterClass}: ${Object.keys(clips).length} clips`);
  return { template, clips };
}

const cache = new Map<CharacterClass, Promise<CharacterAssets>>();

/** Load (or return the cached promise for) a character class's shared assets. */
export function loadCharacterAssets(rawClass: string): Promise<CharacterAssets> {
  const characterClass: CharacterClass = rawClass === 'Paladin' ? 'Paladin' : 'Wizard';
  let pending = cache.get(characterClass);
  if (!pending) {
    pending = buildAssets(characterClass);
    cache.set(characterClass, pending);
  }
  return pending;
}

/** Clone the rigged template so an instance can animate independently. */
export function instantiateCharacter(template: THREE.Group): THREE.Group {
  return cloneSkeleton(template) as THREE.Group;
}
