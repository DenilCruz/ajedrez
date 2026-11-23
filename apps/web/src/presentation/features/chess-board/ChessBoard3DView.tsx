import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Environment, OrbitControls, Sky, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { PromotionPiece } from '@chess-platform/shared-domain';
import { defaultPieces, fenStringToPositionObject } from 'react-chessboard';
import type { ChessBoardViewProps } from './ChessBoardView';

export type BoardViewMode = '2d' | '3d';
export type PieceStyle3D = 'classic' | 'egyptian';

export interface ChessBoard3DViewProps extends ChessBoardViewProps {
  pieceStyle?: PieceStyle3D;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

// Exact glTF metric coordinates from blenderchess:
// Board outer size: 0.96 x 0.96, base at Y = 0.0, top playing surface at Y = 0.034
// 64-square grid: 0.80 x 0.80 (-0.40 .. +0.40), each square = 0.10 x 0.10
const BOARD_SURFACE_Y = 0.034;
const SQUARE_SIZE = 0.1;
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 0.88, 0.92];

const MOVE_ANIMATION_DURATION_SEC = 0.34;
const CAPTURE_BURST_DURATION_SEC = 0.48;

const CHESSBOARD_GLB_URL = '/models/environment/chessboard.glb';
const GRASS_PATCH_GLB_URL = '/models/environment/grass_patch.glb';
const NATURE_AROUND_GLB_URL = '/models/environment/nature_around_board.glb';
const BUTTERFLY_GLB_URL = '/models/environment/butterfly.glb';
const DUNG_BEETLE_GLB_URL = '/models/environment/dung_beetle.glb';
const TREE_OAK_3D_GLB_URL = '/models/environment/tree_oak_3d.glb';
const TREE_PINE_3D_GLB_URL = '/models/environment/tree_pine_3d.glb';
const BUSH_3D_GLB_URL = '/models/environment/bush_3d.glb';

const PIECE_TARGET_HEIGHT: Record<string, number> = {
  P: 0.072,
  R: 0.082,
  N: 0.088,
  B: 0.094,
  Q: 0.106,
  K: 0.116,
};

const PROMOTION_OPTIONS: ReadonlyArray<{ piece: PromotionPiece; label: string }> = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Alfil' },
  { piece: 'n', label: 'Caballo' },
];

// 360-degree forest rings around the clearing (outside camera maxDistance=2.2 so nothing blocks the board)
const TREE_PLACEMENTS: ReadonlyArray<{
  kind: 'oak' | 'pine';
  pos: [number, number, number];
  scale: number;
  rotY: number;
}> = [
  // Inner ring (radius ~2.2 - 3.0)
  { kind: 'oak', pos: [-1.75, 0, -1.5], scale: 0.72, rotY: 0.3 },
  { kind: 'pine', pos: [0.15, 0, -2.35], scale: 0.85, rotY: 1.1 },
  { kind: 'oak', pos: [1.8, 0, -1.6], scale: 0.78, rotY: 2.2 },
  { kind: 'pine', pos: [-2.4, 0, -0.15], scale: 0.82, rotY: 0.8 },
  { kind: 'oak', pos: [2.45, 0, -0.1], scale: 0.74, rotY: 1.9 },
  { kind: 'pine', pos: [-1.95, 0, 1.35], scale: 0.72, rotY: 2.7 },
  { kind: 'oak', pos: [1.95, 0, 1.3], scale: 0.7, rotY: 0.5 },
  { kind: 'pine', pos: [-1.15, 0, -2.9], scale: 0.92, rotY: 1.5 },
  { kind: 'oak', pos: [1.3, 0, -2.95], scale: 0.88, rotY: 2.9 },
  // Front-side inner ring (behind initial camera, visible when orbiting 360°)
  { kind: 'oak', pos: [-1.25, 0, 2.55], scale: 0.76, rotY: 1.2 },
  { kind: 'pine', pos: [0.05, 0, 2.85], scale: 0.84, rotY: 2.4 },
  { kind: 'oak', pos: [1.35, 0, 2.5], scale: 0.78, rotY: 0.4 },
  // Outer 360° forest ring (radius ~3.4 - 5.2)
  { kind: 'pine', pos: [-3.1, 0, -2.1], scale: 0.96, rotY: 0.9 },
  { kind: 'oak', pos: [-2.3, 0, -3.5], scale: 0.92, rotY: 2.1 },
  { kind: 'pine', pos: [-0.4, 0, -4.1], scale: 1.05, rotY: 0.4 },
  { kind: 'oak', pos: [1.1, 0, -4.2], scale: 0.98, rotY: 1.7 },
  { kind: 'pine', pos: [2.8, 0, -3.1], scale: 0.94, rotY: 2.5 },
  { kind: 'oak', pos: [3.6, 0, -1.6], scale: 0.88, rotY: 0.7 },
  { kind: 'pine', pos: [3.9, 0, 0.25], scale: 0.95, rotY: 1.3 },
  { kind: 'oak', pos: [3.4, 0, 1.9], scale: 0.85, rotY: 2.8 },
  { kind: 'pine', pos: [-3.7, 0, -1.2], scale: 0.9, rotY: 1.8 },
  { kind: 'oak', pos: [-3.8, 0, 0.55], scale: 0.94, rotY: 0.2 },
  { kind: 'pine', pos: [-3.2, 0, 2.15], scale: 0.86, rotY: 2.4 },
  { kind: 'oak', pos: [-2.2, 0, 3.3], scale: 0.88, rotY: 1.1 },
  { kind: 'pine', pos: [-0.85, 0, 3.9], scale: 0.95, rotY: 2.0 },
  { kind: 'oak', pos: [0.95, 0, 3.85], scale: 0.9, rotY: 0.8 },
  { kind: 'pine', pos: [2.35, 0, 3.2], scale: 0.88, rotY: 1.6 },
  { kind: 'oak', pos: [-3.1, 0, -3.2], scale: 1.02, rotY: 2.7 },
  { kind: 'pine', pos: [3.35, 0, -2.7], scale: 0.98, rotY: 0.5 },
  { kind: 'oak', pos: [-3.3, 0, 3.0], scale: 0.94, rotY: 1.4 },
  { kind: 'pine', pos: [3.4, 0, 2.85], scale: 0.92, rotY: 2.3 },
];

const BUSH_PLACEMENTS: ReadonlyArray<{
  pos: [number, number, number];
  scale: number;
  rotY: number;
}> = [
  { pos: [-1.35, 0, -1.1], scale: 0.9, rotY: 0.4 },
  { pos: [1.35, 0, -1.15], scale: 0.85, rotY: 1.7 },
  { pos: [-0.65, 0, -1.65], scale: 0.95, rotY: 2.3 },
  { pos: [0.75, 0, -1.6], scale: 0.8, rotY: 0.9 },
  { pos: [-1.7, 0, 0.45], scale: 0.88, rotY: 1.2 },
  { pos: [1.65, 0, 0.5], scale: 0.92, rotY: 2.6 },
  { pos: [-1.25, 0, 1.15], scale: 0.78, rotY: 0.2 },
  { pos: [1.3, 0, 1.1], scale: 0.82, rotY: 1.9 },
  { pos: [-2.05, 0, -0.75], scale: 0.95, rotY: 0.8 },
  { pos: [2.1, 0, -0.7], scale: 0.9, rotY: 2.1 },
  { pos: [-0.15, 0, -2.0], scale: 0.85, rotY: 1.4 },
  { pos: [-1.5, 0, -2.2], scale: 1.05, rotY: 0.5 },
  { pos: [1.55, 0, -2.25], scale: 1.0, rotY: 2.8 },
  { pos: [-2.6, 0, 0.95], scale: 0.92, rotY: 1.6 },
  { pos: [2.55, 0, 0.9], scale: 0.96, rotY: 0.3 },
  { pos: [-2.45, 0, -1.75], scale: 1.08, rotY: 2.2 },
  { pos: [2.5, 0, -1.85], scale: 1.02, rotY: 1.0 },
  { pos: [-1.55, 0, 1.95], scale: 0.86, rotY: 2.5 },
  { pos: [1.6, 0, 1.9], scale: 0.84, rotY: 0.7 },
  // Front-side bushes closing the 360° clearing perimeter
  { pos: [-0.75, 0, 2.3], scale: 0.88, rotY: 1.1 },
  { pos: [0.7, 0, 2.35], scale: 0.9, rotY: 2.4 },
  { pos: [-0.05, 0, 2.55], scale: 0.82, rotY: 0.6 },
  { pos: [-1.85, 0, 2.45], scale: 0.98, rotY: 1.8 },
  { pos: [1.9, 0, 2.4], scale: 0.94, rotY: 2.9 },
];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Exact 3D center of square (col 0=a..7=h, row 0=rank 1..7=rank 8):
 * x = -0.35 + col * 0.10
 * y = 0.034
 * z =  0.35 - row * 0.10
 */
function squareToPosition(square: string): [number, number, number] {
  const col = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const row = Number(square[1]) - 1;
  const x = -0.35 + col * SQUARE_SIZE;
  const z = 0.35 - row * SQUARE_SIZE;
  return [x, BOARD_SURFACE_Y, z];
}

function createSoftParticleTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255, 252, 230, 1)');
  grad.addColorStop(0.45, 'rgba(255, 240, 180, 0.65)');
  grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createCanopyGoboTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, 256, 256);

  // Soft dappled tree canopy / cloud shadow clusters
  const blobs = [
    { x: 52, y: 64, r: 44 },
    { x: 88, y: 50, r: 36 },
    { x: 185, y: 82, r: 50 },
    { x: 150, y: 112, r: 38 },
    { x: 70, y: 188, r: 48 },
    { x: 112, y: 170, r: 35 },
    { x: 205, y: 196, r: 42 },
  ];

  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.15, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function applyGpuWindShader(
  material: THREE.Material,
  uTimeUniform: { value: number },
  amplitude: number,
  cacheKey: string,
): THREE.Material {
  const clonedMat = material.clone();
  clonedMat.side = THREE.DoubleSide;
  clonedMat.transparent = false;
  clonedMat.depthWrite = true;
  clonedMat.depthTest = true;
  clonedMat.alphaTest = Math.max(clonedMat.alphaTest, 0.5);
  clonedMat.customProgramCacheKey = () => cacheKey;
  clonedMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTimeUniform;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float heightNorm = clamp((position.y - 0.002) / 0.062, 0.0, 1.0);
      float windMask = heightNorm * heightNorm;
      // Traveling wind gust wave across zones
      float gustPhase = position.x * 2.8 + position.z * 2.1 - uTime * 1.45;
      float gustEnvelope = 0.55 + 0.9 * pow(0.5 + 0.5 * sin(gustPhase), 2.0);
      float travelWave = sin(gustPhase * 1.8);
      float microFlutter = sin(uTime * 3.4 + position.x * 13.0 + position.z * 10.0)
        + 0.45 * cos(uTime * 2.0 + position.x * 7.0 - position.z * 8.5);
      float windWaveX = (travelWave * 0.65 + microFlutter * 0.45) * gustEnvelope;
      float windWaveZ = (travelWave * 0.38 + cos(uTime * 2.3 + position.z * 11.0) * 0.35) * gustEnvelope;
      transformed.x += windWaveX * ${amplitude.toFixed(4)} * windMask;
      transformed.z += windWaveZ * ${amplitude.toFixed(4)} * windMask;`,
    );
  };
  clonedMat.needsUpdate = true;
  return clonedMat;
}

interface RoamingButterflyConfig {
  orbitRadius: number;
  speed: number;
  direction: 1 | -1;
  phase: number;
}

const BUTTERFLY_FLIGHT_CONFIGS: ReadonlyArray<RoamingButterflyConfig> = [
  { orbitRadius: 0.56, speed: 0.65, direction: 1, phase: 0.0 },
  { orbitRadius: 0.68, speed: 0.52, direction: -1, phase: 2.1 },
  { orbitRadius: 0.48, speed: 0.72, direction: 1, phase: 3.8 },
  { orbitRadius: 0.76, speed: 0.46, direction: -1, phase: 5.1 },
];

interface ButterflyParts {
  bodyGeo: THREE.BufferGeometry;
  wingLGeo: THREE.BufferGeometry;
  wingRGeo: THREE.BufferGeometry;
  material: THREE.Material;
}

interface ButterflyLandingTarget {
  square: string;
  x: number;
  y: number;
  z: number;
}

function RoamingButterfly({
  parts,
  config,
  landingTargets,
}: {
  parts: ButterflyParts;
  config: RoamingButterflyConfig;
  landingTargets: ReadonlyArray<ButterflyLandingTarget>;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  const targetsRef = useRef(landingTargets);
  targetsRef.current = landingTargets;

  const flightRef = useRef<{
    state: 'roaming' | 'approaching' | 'perched' | 'taking_off';
    timer: number;
    nextSwitch: number;
    orbitTime: number;
    takeOffTarget: THREE.Vector3;
    target: ButterflyLandingTarget | null;
    pickSeed: number;
    pos: THREE.Vector3;
  }>({
    state: 'roaming',
    timer: 0,
    nextSwitch: 5.5 + config.phase * 1.1,
    orbitTime: 0,
    takeOffTarget: new THREE.Vector3(),
    target: null,
    pickSeed: Math.round(config.phase * 10),
    pos: new THREE.Vector3(
      Math.cos(config.phase) * config.orbitRadius,
      0.16,
      Math.sin(config.phase) * config.orbitRadius,
    ),
  });

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;
    if (!root) return;

    const dt = Math.min(delta, 0.1);
    const t = clock.getElapsedTime();
    const fl = flightRef.current;

    const computeOrbitPos = (orbitTimeVal: number): [number, number, number] => {
      const angle =
        orbitTimeVal * config.speed * config.direction + config.phase;
      const radiusWave =
        config.orbitRadius + Math.sin(orbitTimeVal * 0.8 + config.phase) * 0.16;
      const x =
        Math.cos(angle) * radiusWave +
        Math.sin(angle * 2.0 + config.phase) * 0.14;
      const z =
        Math.sin(angle) * radiusWave +
        Math.cos(angle * 1.5 + config.phase) * 0.14;
      const y =
        0.11 +
        (0.5 + 0.5 * Math.sin(orbitTimeVal * 2.1 + config.phase)) * 0.12 +
        Math.sin(t * 22 + config.phase) * 0.004;
      return [x, y, z];
    };

    const startTakeOff = () => {
      // Align orbitTime so the next orbit point is right ahead of where the butterfly currently is
      const currentAngle = Math.atan2(fl.pos.z, fl.pos.x);
      fl.orbitTime =
        (currentAngle - config.phase) / (config.speed * config.direction);
      const [ox, oy, oz] = computeOrbitPos(fl.orbitTime + 1.2);
      fl.takeOffTarget.set(ox, Math.max(0.18, oy), oz);
      fl.state = 'taking_off';
      fl.target = null;
      fl.timer = 0;
      fl.nextSwitch = 1.1;
    };

    // If the perched/approached piece moved away, take off smoothly
    if (fl.target) {
      const stillThere = targetsRef.current.find(
        (item) =>
          item.square === fl.target?.square &&
          Math.abs(item.x - fl.target.x) < 0.001 &&
          Math.abs(item.z - fl.target.z) < 0.001,
      );
      if (!stillThere) {
        startTakeOff();
      }
    }

    fl.timer += dt;

    if (fl.state === 'taking_off') {
      fl.orbitTime += dt;
      const [ox, oy, oz] = computeOrbitPos(fl.orbitTime);
      fl.takeOffTarget.set(ox, Math.max(0.18, oy), oz);

      const dx = fl.takeOffTarget.x - fl.pos.x;
      const dy = fl.takeOffTarget.y - fl.pos.y;
      const dz = fl.takeOffTarget.z - fl.pos.z;
      const dist = Math.hypot(dx, dy, dz);

      const takeOffSpeed = 0.15;
      if (dist > 1e-4) {
        const step = Math.min(dist, takeOffSpeed * dt);
        fl.pos.x += (dx / dist) * step;
        fl.pos.y += (dy / dist) * step;
        fl.pos.z += (dz / dist) * step;

        const targetYaw = Math.atan2(dx, dz);
        const angleDiff =
          ((targetYaw - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) -
          Math.PI;
        root.rotation.y += angleDiff * Math.min(1, dt * 6);
        root.rotation.x = THREE.MathUtils.lerp(
          root.rotation.x,
          -Math.atan2(dy, Math.hypot(dx, dz) + 1e-5) * 0.55,
          Math.min(1, dt * 6),
        );
        root.rotation.z = THREE.MathUtils.lerp(
          root.rotation.z,
          0,
          Math.min(1, dt * 6),
        );
      }

      const flap = Math.sin(t * 24 + config.phase * 3.0) * 0.85 + 0.12;
      if (wingLRef.current) wingLRef.current.rotation.set(0, 0, -flap);
      if (wingRRef.current) wingRRef.current.rotation.set(0, 0, flap);

      if (fl.timer >= fl.nextSwitch || dist < 0.03) {
        fl.state = 'roaming';
        fl.timer = 0;
        fl.nextSwitch = 5.5 + (fl.pickSeed % 4) * 1.1;
      }
    } else if (fl.state === 'roaming') {
      fl.orbitTime += dt;
      const [ox, oy, oz] = computeOrbitPos(fl.orbitTime);
      const dx = ox - fl.pos.x;
      const dy = oy - fl.pos.y;
      const dz = oz - fl.pos.z;
      const dist = Math.hypot(dx, dy, dz);

      // Speed-capped steering so there is never a sudden snap
      const maxSpeed = 0.24;
      if (dist > 1e-4) {
        const step = Math.min(dist, maxSpeed * dt);
        fl.pos.x += (dx / dist) * step;
        fl.pos.y += (dy / dist) * step;
        fl.pos.z += (dz / dist) * step;

        const targetYaw = Math.atan2(dx, dz);
        const angleDiff =
          ((targetYaw - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) -
          Math.PI;
        root.rotation.y += angleDiff * Math.min(1, dt * 6);
        root.rotation.x = THREE.MathUtils.lerp(
          root.rotation.x,
          -Math.atan2(dy, Math.hypot(dx, dz) + 1e-5) * 0.55,
          Math.min(1, dt * 6),
        );
        root.rotation.z = THREE.MathUtils.lerp(
          root.rotation.z,
          Math.sin(t * 2.4 + config.phase) * 0.16,
          Math.min(1, dt * 6),
        );
      }

      const flap = Math.sin(t * 22 + config.phase * 3.0) * 0.82 + 0.12;
      if (wingLRef.current) wingLRef.current.rotation.set(0, 0, -flap);
      if (wingRRef.current) wingRRef.current.rotation.set(0, 0, flap);

      if (fl.timer >= fl.nextSwitch && targetsRef.current.length > 0) {
        fl.pickSeed += 5;
        const chosen =
          targetsRef.current[fl.pickSeed % targetsRef.current.length];
        fl.target = chosen;
        fl.state = 'approaching';
        fl.timer = 0;
      }
    } else if (fl.state === 'approaching' && fl.target) {
      const tx = fl.target.x;
      const ty = fl.target.y;
      const tz = fl.target.z;
      const dx = tx - fl.pos.x;
      const dy = ty - fl.pos.y;
      const dz = tz - fl.pos.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist < 0.012) {
        fl.pos.set(tx, ty, tz);
        fl.state = 'perched';
        fl.timer = 0;
        fl.nextSwitch = 2.6 + (fl.pickSeed % 3) * 0.7;
      } else {
        const speed = Math.min(0.22, Math.max(0.08, dist * 1.6));
        const step = Math.min(dist, speed * dt);
        fl.pos.x += (dx / dist) * step;
        fl.pos.y += (dy / dist) * step;
        fl.pos.z += (dz / dist) * step;

        const targetYaw = Math.atan2(dx, dz);
        const angleDiff =
          ((targetYaw - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) -
          Math.PI;
        root.rotation.y += angleDiff * Math.min(1, dt * 7);
        root.rotation.x = THREE.MathUtils.lerp(
          root.rotation.x,
          -Math.atan2(dy, Math.hypot(dx, dz) + 1e-5) * 0.45,
          Math.min(1, dt * 7),
        );
      }

      const flap = Math.sin(t * 20 + config.phase) * 0.72 + 0.15;
      if (wingLRef.current) wingLRef.current.rotation.set(0, 0, -flap);
      if (wingRRef.current) wingRRef.current.rotation.set(0, 0, flap);
    } else if (fl.state === 'perched' && fl.target) {
      fl.pos.set(fl.target.x, fl.target.y, fl.target.z);
      // Gentle resting wing pulse while perched on top of the piece
      const restFlap = Math.sin(t * 3.6 + config.phase) * 0.24 + 0.42;
      if (wingLRef.current) wingLRef.current.rotation.set(0, 0, -restFlap);
      if (wingRRef.current) wingRRef.current.rotation.set(0, 0, restFlap);
      root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, 0, Math.min(1, dt * 8));
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, 0, Math.min(1, dt * 8));

      if (fl.timer >= fl.nextSwitch) {
        startTakeOff();
      }
    }

    root.position.copy(fl.pos);
  });

  return (
    <group ref={rootRef}>
      <mesh
        geometry={parts.bodyGeo}
        material={parts.material}
        castShadow
        receiveShadow
      />
      <mesh
        ref={wingLRef}
        geometry={parts.wingLGeo}
        material={parts.material}
        castShadow
        receiveShadow
      />
      <mesh
        ref={wingRRef}
        geometry={parts.wingRGeo}
        material={parts.material}
        castShadow
        receiveShadow
      />
    </group>
  );
}

const BEETLE_SPEED = 0.045; // units/sec across grass, wooden rim, and empty board squares
const BEETLE_GRASS_Y = 0.008;
const PIECE_COLLISION_RADIUS = 0.036;
const NAV_GRID_SIZE = 14; // indices 0..13 -> coords -0.65 .. +0.65 (3..10 = 8x8 board)

const BEETLE_GRASS_POINTS: ReadonlyArray<[number, number]> = [
  [-0.64, 0.56],
  [0.62, 0.58],
  [0.68, -0.52],
  [-0.66, -0.56],
  [-0.74, 0.04],
  [0.74, -0.06],
  [0.08, -0.68],
  [-0.12, 0.68],
];

const BEETLE_RIM_POINTS: ReadonlyArray<[number, number]> = [
  [-0.435, 0.435],
  [0.435, 0.435],
  [0.435, -0.435],
  [-0.435, -0.435],
  [0.0, 0.435],
  [0.435, 0.0],
  [0.0, -0.435],
  [-0.435, 0.0],
];

function getBeetleSurfaceY(x: number, z: number): number {
  const maxCoord = Math.max(Math.abs(x), Math.abs(z));
  // Smooth ramp when climbing onto / down from the 0.96m wooden board (half-size = 0.48)
  if (maxCoord <= 0.46) return BOARD_SURFACE_Y;
  if (maxCoord >= 0.52) return BEETLE_GRASS_Y;
  const t = (maxCoord - 0.46) / (0.52 - 0.46);
  const smooth = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(BOARD_SURFACE_Y, BEETLE_GRASS_Y, smooth);
}

function worldToNavCell(x: number, z: number): [number, number] {
  const ix = THREE.MathUtils.clamp(
    Math.round((x + 0.65) / SQUARE_SIZE),
    0,
    NAV_GRID_SIZE - 1,
  );
  const iz = THREE.MathUtils.clamp(
    Math.round((0.65 - z) / SQUARE_SIZE),
    0,
    NAV_GRID_SIZE - 1,
  );
  return [ix, iz];
}

function navCellToWorld(ix: number, iz: number): [number, number] {
  return [-0.65 + ix * SQUARE_SIZE, 0.65 - iz * SQUARE_SIZE];
}

function isNavCellBlocked(
  ix: number,
  iz: number,
  occupiedSquares: ReadonlySet<string>,
): boolean {
  if (ix < 0 || ix >= NAV_GRID_SIZE || iz < 0 || iz >= NAV_GRID_SIZE) {
    return true;
  }
  if (ix >= 3 && ix <= 10 && iz >= 3 && iz <= 10) {
    const sq = `${FILES[ix - 3]}${iz - 3 + 1}`;
    return occupiedSquares.has(sq);
  }
  return false;
}

/**
 * Lightweight A* pathfinder on the 14x14 grid covering grass, rim, and 8x8 board.
 * Prevents corner-cutting next to chess pieces so the beetle steers cleanly around them.
 */
function computeBeetlePath(
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
  occupiedSquares: ReadonlySet<string>,
): Array<[number, number]> {
  const [sx, sz] = worldToNavCell(startX, startZ);
  const [gx, gz] = worldToNavCell(goalX, goalZ);

  if (isNavCellBlocked(gx, gz, occupiedSquares)) {
    return [];
  }
  if (sx === gx && sz === gz) {
    return [[goalX, goalZ]];
  }

  const key = (x: number, z: number) => z * NAV_GRID_SIZE + x;
  const startKey = key(sx, sz);
  const goalKey = key(gx, gz);

  const open = new Set<number>([startKey]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startKey, 0]]);
  const fScore = new Map<number, number>([
    [startKey, Math.hypot(gx - sx, gz - sz)],
  ]);

  const dirs: ReadonlyArray<[number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  while (open.size > 0) {
    let current = -1;
    let lowestF = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = k;
      }
    }

    if (current === goalKey) {
      const waypoints: Array<[number, number]> = [];
      let curr: number | undefined = current;
      while (curr !== undefined && curr !== startKey) {
        const cx = curr % NAV_GRID_SIZE;
        const cz = Math.floor(curr / NAV_GRID_SIZE);
        waypoints.push(navCellToWorld(cx, cz));
        curr = cameFrom.get(curr);
      }
      waypoints.reverse();
      if (waypoints.length > 0) {
        waypoints[waypoints.length - 1] = [goalX, goalZ];
      }
      return waypoints;
    }

    open.delete(current);
    const cx = current % NAV_GRID_SIZE;
    const cz = Math.floor(current / NAV_GRID_SIZE);

    for (const [dx, dz, cost] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (isNavCellBlocked(nx, nz, occupiedSquares)) continue;

      // Do not cut corners diagonally past an occupied square
      if (
        dx !== 0 &&
        dz !== 0 &&
        (isNavCellBlocked(cx + dx, cz, occupiedSquares) ||
          isNavCellBlocked(cx, cz + dz, occupiedSquares))
      ) {
        continue;
      }

      const neighborKey = key(nx, nz);
      const tentativeG = (gScore.get(current) ?? Infinity) + cost;
      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + Math.hypot(gx - nx, gz - nz));
        open.add(neighborKey);
      }
    }
  }

  return [];
}

interface DungBeetleOnBoardProps {
  occupiedSquares: ReadonlySet<string>;
}

function DungBeetleOnBoard({ occupiedSquares }: DungBeetleOnBoardProps) {
  const { scene } = useGLTF(DUNG_BEETLE_GLB_URL);
  const groupRef = useRef<THREE.Group>(null);
  const occupiedRef = useRef(occupiedSquares);
  occupiedRef.current = occupiedSquares;

  const piecePositions = useMemo(() => {
    const coords: Array<[number, number]> = [];
    for (const sq of occupiedSquares) {
      const [px, , pz] = squareToPosition(sq);
      coords.push([px, pz]);
    }
    return coords;
  }, [occupiedSquares]);
  const piecePositionsRef = useRef(piecePositions);
  piecePositionsRef.current = piecePositions;

  const stateRef = useRef({
    x: -0.64,
    z: 0.56,
    path: [[-0.435, 0.435]] as Array<[number, number]>,
    pathIndex: 0,
    goalX: -0.435,
    goalZ: 0.435,
    stepCounter: 0,
    walkTimer: 0,
    pauseRemaining: 0,
    nextWalkDuration: 4.5,
    distanceTraveled: 0,
    gaitPhase: 0,
  });

  const rig = useMemo(() => {
    const cloned = scene.clone(true);
    let ball: THREE.Object3D | null = null;
    let head: THREE.Object3D | null = null;
    const tripodA: Array<{ obj: THREE.Object3D; baseRot: THREE.Euler }> = [];
    const tripodB: Array<{ obj: THREE.Object3D; baseRot: THREE.Euler }> = [];

    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }

      if (obj.name === 'Beetle_Ball') {
        ball = obj;
      } else if (obj.name === 'Beetle_Head') {
        head = obj;
      } else if (
        obj.name === 'Beetle_Leg_FL' ||
        obj.name === 'Beetle_Leg_MR' ||
        obj.name === 'Beetle_Leg_BL'
      ) {
        tripodA.push({ obj, baseRot: obj.rotation.clone() });
      } else if (
        obj.name === 'Beetle_Leg_FR' ||
        obj.name === 'Beetle_Leg_ML' ||
        obj.name === 'Beetle_Leg_BR'
      ) {
        tripodB.push({ obj, baseRot: obj.rotation.clone() });
      }
    });

    return {
      clonedScene: cloned,
      ball: ball as THREE.Object3D | null,
      ballBaseRotX: (ball as THREE.Object3D | null)?.rotation.x ?? 0,
      head: head as THREE.Object3D | null,
      headBaseRotX: (head as THREE.Object3D | null)?.rotation.x ?? 0,
      tripodA,
      tripodB,
    };
  }, [scene]);

  const pickNextTarget = (stepIndex: number): [number, number] => {
    // Cycle naturally between grass, wooden rim, and empty inner squares
    const zone = stepIndex % 3;

    if (zone === 0) {
      return BEETLE_GRASS_POINTS[stepIndex % BEETLE_GRASS_POINTS.length];
    }

    if (zone === 1) {
      return BEETLE_RIM_POINTS[stepIndex % BEETLE_RIM_POINTS.length];
    }

    // Pick an empty square inside the board (preferring middle ranks 3..6)
    const emptySquares: string[] = [];
    for (let row = 2; row <= 5; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const sq = `${FILES[col]}${row + 1}`;
        if (!occupiedRef.current.has(sq)) {
          emptySquares.push(sq);
        }
      }
    }
    if (emptySquares.length > 0) {
      const chosen = emptySquares[(stepIndex * 7) % emptySquares.length];
      const [sx, , sz] = squareToPosition(chosen);
      return [sx, sz];
    }

    return BEETLE_RIM_POINTS[stepIndex % BEETLE_RIM_POINTS.length];
  };

  // Recompute A* path whenever pieces move on the board
  useEffect(() => {
    const st = stateRef.current;
    const nextPath = computeBeetlePath(
      st.x,
      st.z,
      st.goalX,
      st.goalZ,
      occupiedSquares,
    );
    if (nextPath.length > 0) {
      st.path = nextPath;
      st.pathIndex = 0;
    } else {
      st.stepCounter += 1;
      const [gx, gz] = pickNextTarget(st.stepCounter);
      st.goalX = gx;
      st.goalZ = gz;
      const fallback = computeBeetlePath(st.x, st.z, gx, gz, occupiedSquares);
      st.path = fallback.length > 0 ? fallback : [[gx, gz]];
      st.pathIndex = 0;
    }
  }, [occupiedSquares]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(delta, 0.1);
    const st = stateRef.current;

    if (st.pauseRemaining > 0) {
      st.pauseRemaining -= dt;
      return;
    }

    st.walkTimer += dt;
    if (st.walkTimer >= st.nextWalkDuration) {
      st.walkTimer = 0;
      st.pauseRemaining = 1.1 + ((st.stepCounter * 0.37) % 0.9);
      st.nextWalkDuration = 4.2 + ((st.stepCounter * 0.53) % 2.0);
      return;
    }

    const currentWaypoint = st.path[st.pathIndex];
    if (!currentWaypoint) {
      st.stepCounter += 1;
      const [gx, gz] = pickNextTarget(st.stepCounter);
      st.goalX = gx;
      st.goalZ = gz;
      const nextPath = computeBeetlePath(
        st.x,
        st.z,
        gx,
        gz,
        occupiedRef.current,
      );
      st.path = nextPath.length > 0 ? nextPath : [[gx, gz]];
      st.pathIndex = 0;
      return;
    }

    const dx = currentWaypoint[0] - st.x;
    const dz = currentWaypoint[1] - st.z;
    const distToWaypoint = Math.hypot(dx, dz);

    if (distToWaypoint < 0.014) {
      st.pathIndex += 1;
      return;
    }

    const dirX = dx / distToWaypoint;
    const dirZ = dz / distToWaypoint;
    const stepDist = Math.min(BEETLE_SPEED * dt, distToWaypoint);
    const prevX = st.x;
    const prevZ = st.z;
    const prevY = getBeetleSurfaceY(st.x, st.z);

    st.x += dirX * stepDist;
    st.z += dirZ * stepDist;

    // Safety collision guard in case a piece just landed near the beetle
    for (const [px, pz] of piecePositionsRef.current) {
      const offX = st.x - px;
      const offZ = st.z - pz;
      const dist = Math.hypot(offX, offZ);
      if (dist < PIECE_COLLISION_RADIUS) {
        const safeDist = dist > 1e-5 ? dist : 1;
        const nx = dist > 1e-5 ? offX / safeDist : 1;
        const nz = dist > 1e-5 ? offZ / safeDist : 0;
        st.x = px + nx * PIECE_COLLISION_RADIUS;
        st.z = pz + nz * PIECE_COLLISION_RADIUS;
      }
    }

    const actualDx = st.x - prevX;
    const actualDz = st.z - prevZ;
    const actualStepDist = Math.hypot(actualDx, actualDz);
    const nextY = getBeetleSurfaceY(st.x, st.z);

    st.distanceTraveled += actualStepDist;
    st.gaitPhase += dt * 16;

    // Tripod gait: FL, MR, BL in opposite phase to FR, ML, BR
    const swingA = Math.sin(st.gaitPhase) * 0.38;
    const liftA = Math.max(0, Math.cos(st.gaitPhase)) * 0.22;
    const swingB = -swingA;
    const liftB = Math.max(0, -Math.cos(st.gaitPhase)) * 0.22;

    for (const leg of rig.tripodA) {
      leg.obj.rotation.set(
        leg.baseRot.x + swingA,
        leg.baseRot.y + swingA * 0.45,
        leg.baseRot.z + liftA,
      );
    }
    for (const leg of rig.tripodB) {
      leg.obj.rotation.set(
        leg.baseRot.x + swingB,
        leg.baseRot.y + swingB * 0.45,
        leg.baseRot.z - liftB,
      );
    }

    // Roll Beetle_Ball synchronized with distance traveled (radius ~0.012)
    if (rig.ball) {
      rig.ball.rotation.x = rig.ballBaseRotX - st.distanceTraveled / 0.012;
    }

    // Subtle head nod while pushing the ball
    if (rig.head) {
      rig.head.rotation.x =
        rig.headBaseRotX + Math.sin(st.gaitPhase * 0.5) * 0.12;
    }

    group.position.set(st.x, nextY, st.z);

    // Model faces -Z in glTF space; tilt pitch slightly when climbing onto/off the board
    if (actualStepDist > 1e-5) {
      const targetYaw = Math.atan2(-actualDx, -actualDz);
      const angleDiff =
        ((targetYaw - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) -
        Math.PI;
      group.rotation.y += angleDiff * Math.min(1, dt * 7);
    }

    const slopePitch = Math.atan2(nextY - prevY, Math.max(actualStepDist, 1e-4));
    group.rotation.x = THREE.MathUtils.lerp(
      group.rotation.x,
      THREE.MathUtils.clamp(slopePitch, -0.45, 0.45),
      Math.min(1, dt * 10),
    );
  });

  return (
    <group
      ref={groupRef}
      position={[-0.64, BEETLE_GRASS_Y, 0.56]}
    >
      <primitive object={rig.clonedScene} />
    </group>
  );
}

interface EnvironmentModelsProps {
  boardGroupRef: React.RefObject<THREE.Group | null>;
  occupiedSquares: ReadonlySet<string>;
  butterflyLandingTargets: ReadonlyArray<ButterflyLandingTarget>;
  onBoardPointClick: (localPoint: THREE.Vector3) => void;
}

function EnvironmentModels({
  boardGroupRef,
  occupiedSquares,
  butterflyLandingTargets,
  onBoardPointClick,
}: EnvironmentModelsProps) {
  const { scene: boardScene } = useGLTF(CHESSBOARD_GLB_URL);
  const { scene: grassScene } = useGLTF(GRASS_PATCH_GLB_URL);
  const { scene: natureScene } = useGLTF(NATURE_AROUND_GLB_URL);
  const { scene: butterflyScene } = useGLTF(BUTTERFLY_GLB_URL);
  const { scene: oakTreeScene } = useGLTF(TREE_OAK_3D_GLB_URL);
  const { scene: pineTreeScene } = useGLTF(TREE_PINE_3D_GLB_URL);
  const { scene: bushScene } = useGLTF(BUSH_3D_GLB_URL);

  const windTimeUniform = useRef({ value: 0 });

  const boardModel = useMemo(() => {
    const cloned = boardScene.clone(true);
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return cloned;
  }, [boardScene]);

  const { grassModel, outerMeadowMaterial } = useMemo(() => {
    const cloned = grassScene.clone(true);
    let groundMatClone: THREE.Material | null = null;

    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.name === 'Grass_Ground' || obj.name.toLowerCase().includes('ground')) {
          obj.receiveShadow = true;
          if (obj.material instanceof THREE.MeshStandardMaterial) {
            const m = obj.material.clone();
            if (m.map) {
              const mapClone = m.map.clone();
              mapClone.wrapS = THREE.RepeatWrapping;
              mapClone.wrapT = THREE.RepeatWrapping;
              mapClone.repeat.set(12, 12);
              mapClone.needsUpdate = true;
              m.map = mapClone;
            }
            if (m.normalMap) {
              const normClone = m.normalMap.clone();
              normClone.wrapS = THREE.RepeatWrapping;
              normClone.wrapT = THREE.RepeatWrapping;
              normClone.repeat.set(12, 12);
              normClone.needsUpdate = true;
              m.normalMap = normClone;
            }
            groundMatClone = m;
          }
        } else if (
          obj.name === 'Grass_Blades' ||
          obj.name.toLowerCase().includes('blade')
        ) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (!Array.isArray(obj.material)) {
            obj.material = applyGpuWindShader(
              obj.material,
              windTimeUniform.current,
              0.015,
              'grass-blades-y-wind-v3',
            );
          }
        }
      }
    });

    return { grassModel: cloned, outerMeadowMaterial: groundMatClone };
  }, [grassScene]);

  const natureModel = useMemo(() => {
    const cloned = natureScene.clone(true);

    cloned.traverse((obj) => {
      if (obj.name.includes('Butterfly')) {
        // Hide static embedded butterflies so only the roaming R3F butterflies are rendered
        obj.visible = false;
        return;
      }

      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;

        if (
          obj.name === 'Nature_Scatter_Clovers' ||
          obj.name === 'Nature_Scatter_Flowers'
        ) {
          if (!Array.isArray(obj.material)) {
            obj.material = applyGpuWindShader(
              obj.material,
              windTimeUniform.current,
              0.012,
              `nature-${obj.name}-y-wind-v3`,
            );
          }
        } else if (!Array.isArray(obj.material)) {
          obj.material.side = THREE.DoubleSide;
        }
      }
    });

    return cloned;
  }, [natureScene]);

  const butterflyParts = useMemo<ButterflyParts | null>(() => {
    let bodyGeo: THREE.BufferGeometry | null = null;
    let wingLGeo: THREE.BufferGeometry | null = null;
    let wingRGeo: THREE.BufferGeometry | null = null;
    let sharedMat: THREE.Material | null = null;

    butterflyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!sharedMat && !Array.isArray(obj.material)) {
          const m = obj.material.clone();
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
          sharedMat = m;
        }
        if (obj.name.endsWith('_Body')) {
          bodyGeo = obj.geometry;
        } else if (obj.name.endsWith('_Wing_L')) {
          wingLGeo = obj.geometry;
        } else if (obj.name.endsWith('_Wing_R')) {
          wingRGeo = obj.geometry;
        }
      }
    });

    if (!bodyGeo || !wingLGeo || !wingRGeo || !sharedMat) {
      return null;
    }

    return {
      bodyGeo,
      wingLGeo,
      wingRGeo,
      material: sharedMat,
    };
  }, [butterflyScene]);

  const prepareFoliageBase = (sourceScene: THREE.Group): THREE.Group => {
    const base = sourceScene.clone(true);
    base.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        const prepared = materials.map((mat) => {
          const next = mat.clone();
          next.alphaTest = 0.5;
          next.transparent = false;
          next.depthWrite = true;
          next.depthTest = true;
          next.side = THREE.DoubleSide;
          next.needsUpdate = true;
          return next;
        });
        obj.material = Array.isArray(obj.material) ? prepared : prepared[0];
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return base;
  };

  const preparedOakBase = useMemo(() => prepareFoliageBase(oakTreeScene), [oakTreeScene]);
  const preparedPineBase = useMemo(() => prepareFoliageBase(pineTreeScene), [pineTreeScene]);
  const preparedBushBase = useMemo(() => prepareFoliageBase(bushScene), [bushScene]);

  const treeInstances = useMemo(() => {
    return TREE_PLACEMENTS.map((item, idx) => {
      const base = item.kind === 'oak' ? preparedOakBase : preparedPineBase;
      return { key: `tree-${item.kind}-${idx}`, cloned: base.clone(true), ...item };
    });
  }, [preparedOakBase, preparedPineBase]);

  const bushInstances = useMemo(() => {
    return BUSH_PLACEMENTS.map((item, idx) => {
      return { key: `bush-${idx}`, cloned: preparedBushBase.clone(true), ...item };
    });
  }, [preparedBushBase]);

  useFrame((_, delta) => {
    windTimeUniform.current.value += delta;
  });

  const handleBoardClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const localPoint = event.point.clone();
    if (boardGroupRef.current) {
      boardGroupRef.current.worldToLocal(localPoint);
    }
    onBoardPointClick(localPoint);
  };

  return (
    <group>
      {/* 1. Tablero en (0, 0, 0) con raycasting directo a las 64 casillas */}
      <primitive
        object={boardModel}
        position={[0, 0, 0]}
        onClick={handleBoardClick}
      />

      {/* 2. Pasto en (0, 0, 0) */}
      <primitive object={grassModel} position={[0, 0, 0]} />

      {/* Extensión circular debajo del pasto para que el horizonte hacia los árboles no tenga corte */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.012, 0]}
        receiveShadow
      >
        <circleGeometry args={[12, 64]} />
        {outerMeadowMaterial ? (
          <primitive object={outerMeadowMaterial} attach="material" />
        ) : (
          <meshStandardMaterial color="#3b5e28" roughness={0.9} metalness={0.02} />
        )}
      </mesh>

      {/* 3. Vida natural (tréboles, flores, piedritas) en (0, 0, 0) + mariposas y escarabajo animado */}
      <primitive object={natureModel} position={[0, 0, 0]} />
      <DungBeetleOnBoard occupiedSquares={occupiedSquares} />
      {butterflyParts
        ? BUTTERFLY_FLIGHT_CONFIGS.map((cfg, idx) => (
            <RoamingButterfly
              key={`roaming-butterfly-${idx}`}
              parts={butterflyParts}
              config={cfg}
              landingTargets={butterflyLandingTargets}
            />
          ))
        : null}

      {/* 4. Árboles y arbustos impostor en el anillo exterior (radio 1.3 .. 3.5) */}
      {treeInstances.map(({ key, cloned, pos, scale, rotY }) => (
        <primitive
          key={key}
          object={cloned}
          position={pos}
          scale={scale}
          rotation={[0, rotY, 0]}
        />
      ))}
      {bushInstances.map(({ key, cloned, pos, scale, rotY }) => (
        <primitive
          key={key}
          object={cloned}
          position={pos}
          scale={scale}
          rotation={[0, rotY, 0]}
        />
      ))}
    </group>
  );
}

const POLLEN_COUNT = 85;

function PollenParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const dotTexture = useMemo(() => createSoftParticleTexture(), []);

  const { positions, phases } = useMemo(() => {
    const pos = new Float32Array(POLLEN_COUNT * 3);
    const ph = new Float32Array(POLLEN_COUNT);

    for (let i = 0; i < POLLEN_COUNT; i += 1) {
      const u1 = (i * 0.61803398875) % 1;
      const u2 = (i * 0.38196601125) % 1;
      const u3 = (i * 0.7548776662) % 1;
      const angle = u1 * Math.PI * 2;
      const radius = 0.08 + u2 * 1.25;

      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = 0.05 + u3 * 0.46;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      ph[i] = i * 0.47;
    }

    return { positions: pos, phases: ph };
  }, []);

  useFrame(({ clock }) => {
    const pts = pointsRef.current;
    if (!pts) return;

    const attr = pts.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute | null;
    if (!attr) return;

    const t = clock.getElapsedTime();
    for (let i = 0; i < POLLEN_COUNT; i += 1) {
      const phase = phases[i];
      const x = attr.getX(i) + Math.sin(t * 0.48 + phase) * 0.00038;
      let y = attr.getY(i) + 0.0002 + Math.cos(t * 0.65 + phase) * 0.00014;
      const z = attr.getZ(i) + Math.cos(t * 0.42 + phase) * 0.00038;

      if (y > 0.54) {
        y = 0.045;
      }
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#fff6c8"
        map={dotTexture ?? undefined}
        size={0.015}
        transparent
        opacity={0.82}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Invisible overhead canopy plane that casts slow-drifting dappled tree/cloud shadows
 * across the chessboard and grass.
 */
function MovingCanopyShadow() {
  const meshRef = useRef<THREE.Mesh>(null);
  const goboTexture = useMemo(() => createCanopyGoboTexture(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    mesh.position.x = Math.sin(t * 0.09) * 0.55;
    mesh.position.z = Math.cos(t * 0.07) * 0.55;
  });

  if (!goboTexture) return null;

  return (
    <mesh
      ref={meshRef}
      position={[0, 1.55, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
    >
      <planeGeometry args={[2.8, 2.8]} />
      <meshBasicMaterial
        map={goboTexture}
        alphaTest={0.46}
        colorWrite={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

interface LegalMoveIndicatorProps {
  isCaptureTarget: boolean;
  onSelect: () => void;
}

function LegalMoveIndicator({
  isCaptureTarget,
  onSelect,
}: LegalMoveIndicatorProps) {
  const primaryRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const wave = 0.5 + 0.5 * Math.sin(t * 4.2);

    if (primaryRef.current) {
      const s = 0.94 + wave * 0.12;
      primaryRef.current.scale.set(s, s, 1);
      const mat = primaryRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isCaptureTarget ? 0.68 + wave * 0.25 : 0.45 + wave * 0.25;
    }

    if (pulseRef.current) {
      const haloScale = 0.85 + wave * 0.35;
      pulseRef.current.scale.set(haloScale, haloScale, 1);
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - wave) * 0.35;
    }
  });

  return (
    <group position={[0, 0.001, 0]}>
      <mesh
        ref={pulseRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <circleGeometry args={[isCaptureTarget ? 0.044 : 0.025, 24]} />
        <meshBasicMaterial
          color={isCaptureTarget ? '#10b981' : '#f59e0b'}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>

      {isCaptureTarget ? (
        <mesh
          ref={primaryRef}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <ringGeometry args={[0.031, 0.043, 32]} />
          <meshBasicMaterial
            color="#10b981"
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ) : (
        <mesh
          ref={primaryRef}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <circleGeometry args={[0.016, 24]} />
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.62}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

const DUST_PARTICLE_COUNT = 22;

interface CaptureBurstEffectProps {
  position: [number, number, number];
}

function CaptureBurstEffect({ position }: CaptureBurstEffectProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const dustRef = useRef<THREE.Points>(null);
  const elapsedRef = useRef(0);
  const dotTexture = useMemo(() => createSoftParticleTexture(), []);

  const { initialDustPositions, dustVelocities } = useMemo(() => {
    const pos = new Float32Array(DUST_PARTICLE_COUNT * 3);
    const vel = new Float32Array(DUST_PARTICLE_COUNT * 3);

    for (let i = 0; i < DUST_PARTICLE_COUNT; i += 1) {
      const angle = (i / DUST_PARTICLE_COUNT) * Math.PI * 2;
      const speed = 0.08 + ((i * 0.618) % 1) * 0.11;
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0.004;
      pos[i * 3 + 2] = 0;

      vel[i * 3] = Math.cos(angle) * speed;
      vel[i * 3 + 1] = 0.07 + ((i * 0.382) % 1) * 0.09;
      vel[i * 3 + 2] = Math.sin(angle) * speed;
    }

    return { initialDustPositions: pos, dustVelocities: vel };
  }, []);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [position]);

  useFrame((_, delta) => {
    elapsedRef.current = Math.min(
      CAPTURE_BURST_DURATION_SEC,
      elapsedRef.current + delta,
    );
    const progress = elapsedRef.current / CAPTURE_BURST_DURATION_SEC;
    const eased = easeOutCubic(progress);

    if (ringRef.current) {
      const scale = 0.35 + eased * 1.45;
      ringRef.current.scale.set(scale, scale, 1);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - progress) * 0.88;
    }

    if (flashRef.current) {
      const flashScale = 0.4 + eased * 0.95;
      flashRef.current.scale.set(flashScale, flashScale, 1);
      const mat = flashRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - progress) * 0.5;
    }

    if (dustRef.current) {
      const t = elapsedRef.current;
      const attr = dustRef.current.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute | null;
      if (attr) {
        for (let i = 0; i < DUST_PARTICLE_COUNT; i += 1) {
          const vx = dustVelocities[i * 3];
          const vy = dustVelocities[i * 3 + 1];
          const vz = dustVelocities[i * 3 + 2];
          const x = vx * t;
          const y = Math.max(0.002, 0.004 + vy * t - 0.16 * t * t);
          const z = vz * t;
          attr.setXYZ(i, x, y, z);
        }
        attr.needsUpdate = true;
      }
      const pMat = dustRef.current.material as THREE.PointsMaterial;
      pMat.opacity = (1 - progress) * 0.9;
    }
  });

  return (
    <group position={[position[0], BOARD_SURFACE_Y + 0.002, position[2]]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.028, 0.042, 32]} />
        <meshBasicMaterial
          color="#f59e0b"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={flashRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.045, 24]} />
        <meshBasicMaterial
          color="#fde68a"
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[initialDustPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#fef08a"
          map={dotTexture ?? undefined}
          size={0.013}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}

interface ChessPieceModelProps {
  pieceKey: string;
  pieceStyle: PieceStyle3D;
  square: string;
  isSelected: boolean;
  moveFromSquare: string | null;
  isCaptureMove: boolean;
  onSelectSquare: (square: string) => void;
}

function ChessPieceModel({
  pieceKey,
  pieceStyle,
  square,
  isSelected,
  moveFromSquare,
  isCaptureMove,
  onSelectSquare,
}: ChessPieceModelProps) {
  const modelUrl = `/models/${pieceStyle}/${pieceKey}.glb`;
  const { scene } = useGLTF(modelUrl);
  const groupRef = useRef<THREE.Group>(null);
  const animProgressRef = useRef(moveFromSquare ? 0 : 1);

  const normalized = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const pieceLetter = pieceKey[1] ?? 'P';
    const targetHeight = PIECE_TARGET_HEIGHT[pieceLetter] ?? 0.085;
    const scale = size.y > 0 ? targetHeight / size.y : 0.1;

    const offset: [number, number, number] = [
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale,
    ];

    return { cloned, scale, offset };
  }, [scene, pieceKey]);

  const targetPos = useMemo(() => squareToPosition(square), [square]);
  const fromPos = useMemo(
    () => (moveFromSquare ? squareToPosition(moveFromSquare) : targetPos),
    [moveFromSquare, targetPos],
  );

  useEffect(() => {
    animProgressRef.current = moveFromSquare ? 0 : 1;
  }, [moveFromSquare, square]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const targetLift = isSelected ? 0.016 : 0;

    if (animProgressRef.current < 1) {
      animProgressRef.current = Math.min(
        1,
        animProgressRef.current + delta / MOVE_ANIMATION_DURATION_SEC,
      );
      const p = animProgressRef.current;
      const travelSplit = 0.74;

      if (p <= travelSplit) {
        const travelProgress = p / travelSplit;
        const t = easeOutCubic(travelProgress);
        const isKnight = pieceKey[1] === 'N';
        const arcHeight = isKnight ? 0.058 : isCaptureMove ? 0.038 : 0.02;
        const arcY = Math.sin(travelProgress * Math.PI) * arcHeight;

        group.position.x = THREE.MathUtils.lerp(fromPos[0], targetPos[0], t);
        group.position.z = THREE.MathUtils.lerp(fromPos[2], targetPos[2], t);
        group.position.y = BOARD_SURFACE_Y + arcY + targetLift;
      } else {
        // Subtle tactile landing bounce once the piece touches the target square
        const bounceProgress = (p - travelSplit) / (1 - travelSplit);
        const bounceY =
          Math.sin(bounceProgress * Math.PI) *
          (isCaptureMove ? 0.0085 : 0.0055);
        group.position.x = targetPos[0];
        group.position.z = targetPos[2];
        group.position.y = BOARD_SURFACE_Y + bounceY + targetLift;
      }
    } else {
      group.position.x = targetPos[0];
      group.position.z = targetPos[2];
      group.position.y = THREE.MathUtils.lerp(
        group.position.y,
        BOARD_SURFACE_Y + targetLift,
        Math.min(1, delta * 14),
      );
    }
  });

  const isBlackPiece = pieceKey.startsWith('b');

  return (
    <group
      ref={groupRef}
      position={[fromPos[0], BOARD_SURFACE_Y, fromPos[2]]}
      rotation={[0, isBlackPiece ? 0 : Math.PI, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelectSquare(square);
      }}
    >
      <primitive
        object={normalized.cloned}
        scale={normalized.scale}
        position={normalized.offset}
      />
    </group>
  );
}

interface BoardSceneProps {
  fen: string;
  orientation: 'white' | 'black';
  legalMoves: ChessBoardViewProps['legalMoves'];
  lastMove: ChessBoardViewProps['lastMove'];
  kingInCheckSquare: string | null;
  selectedSquare: string | null;
  isInteractionDisabled: boolean;
  hasPendingPromotion: boolean;
  pieceStyle: PieceStyle3D;
  resetViewTrigger: number;
  onSquareSelect: (square: string) => void;
}

function BoardScene({
  orientation,
  fen,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  selectedSquare,
  isInteractionDisabled,
  hasPendingPromotion,
  pieceStyle,
  resetViewTrigger,
  onSquareSelect,
}: BoardSceneProps) {
  const { camera, gl, setSize } = useThree();
  const orbitControlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const syncViewport = () => {
      const canvasEl = gl.domElement;
      const parent = canvasEl.parentElement;
      if (!parent) return;

      // Keep CSS sizing 100% controlled by the container so inline px never stretches aspect-square
      canvasEl.style.width = '100%';
      canvasEl.style.height = '100%';

      const rect = parent.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        gl.setSize(rect.width, rect.height, false);
        setSize(rect.width, rect.height);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
        }
        orbitControlsRef.current?.update();
      }
    };

    const handleFullscreenOrResize = () => {
      window.requestAnimationFrame(syncViewport);
      window.setTimeout(syncViewport, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenOrResize);
    window.addEventListener('resize', handleFullscreenOrResize);
    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenOrResize,
      );
      window.removeEventListener('resize', handleFullscreenOrResize);
    };
  }, [camera, gl, setSize]);

  useEffect(() => {
    if (resetViewTrigger === 0) return;

    camera.position.set(...DEFAULT_CAMERA_POSITION);
    const controls = orbitControlsRef.current;
    if (controls) {
      controls.target.set(0, BOARD_SURFACE_Y, 0);
      controls.update();
    } else {
      camera.lookAt(0, BOARD_SURFACE_Y, 0);
    }
  }, [resetViewTrigger, camera]);

  const positionMap = useMemo(() => fenStringToPositionObject(fen, 8, 8), [fen]);
  const occupiedSquares = useMemo(
    () => new Set(Object.keys(positionMap)),
    [positionMap],
  );
  const butterflyLandingTargets = useMemo<ButterflyLandingTarget[]>(() => {
    return Object.entries(positionMap).map(([square, piece]) => {
      const [x, , z] = squareToPosition(square);
      const letter = piece.pieceType[1] ?? 'P';
      const pieceHeight = PIECE_TARGET_HEIGHT[letter] ?? 0.085;
      return {
        square,
        x,
        y: BOARD_SURFACE_Y + pieceHeight + 0.004,
        z,
      };
    });
  }, [positionMap]);
  const prevFenRef = useRef(fen);
  const prevPositionMapRef = useRef(positionMap);
  const [captureBurst, setCaptureBurst] = useState<{
    key: string;
    position: [number, number, number];
  } | null>(null);
  const [lastMoveWasCapture, setLastMoveWasCapture] = useState(false);

  useEffect(() => {
    if (prevFenRef.current === fen) return;

    const prevCount = Object.keys(prevPositionMapRef.current).length;
    const nextCount = Object.keys(positionMap).length;
    const wasCapture =
      lastMove !== null &&
      (Boolean(prevPositionMapRef.current[lastMove.to]) || nextCount < prevCount);

    prevFenRef.current = fen;
    prevPositionMapRef.current = positionMap;
    setLastMoveWasCapture(wasCapture);

    if (wasCapture && lastMove) {
      const burstKey = `${lastMove.from}-${lastMove.to}-${fen}`;
      setCaptureBurst({
        key: burstKey,
        position: squareToPosition(lastMove.to),
      });
      const timer = window.setTimeout(() => {
        setCaptureBurst((current) =>
          current?.key === burstKey ? null : current,
        );
      }, CAPTURE_BURST_DURATION_SEC * 1000);
      return () => window.clearTimeout(timer);
    } else {
      setCaptureBurst(null);
    }
  }, [fen, positionMap, lastMove]);

  const legalTargetCaptureMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!selectedSquare) return map;

    for (const move of legalMoves) {
      if (move.from !== selectedSquare) continue;
      const isCapture = move.san.includes('x') || Boolean(positionMap[move.to]);
      map.set(move.to, (map.get(move.to) ?? false) || isCapture);
    }
    return map;
  }, [selectedSquare, legalMoves, positionMap]);

  const squares = useMemo(() => {
    const items: Array<{
      square: string;
      x: number;
      z: number;
    }> = [];

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = `${FILES[col]}${row + 1}`;
        items.push({
          square,
          x: -0.35 + col * SQUARE_SIZE,
          z: 0.35 - row * SQUARE_SIZE,
        });
      }
    }
    return items;
  }, []);

  const handleSelect = (square: string) => {
    if (isInteractionDisabled || hasPendingPromotion) {
      return;
    }
    onSquareSelect(square);
  };

  /**
   * Exact raycast formula on Chessboard mesh:
   * If Math.abs(point.x) <= 0.40 && Math.abs(point.z) <= 0.40:
   * col = Math.floor((point.x + 0.40) / 0.10)
   * row = Math.floor((0.40 - point.z) / 0.10)
   */
  const handleBoardPointClick = (localPoint: THREE.Vector3) => {
    if (Math.abs(localPoint.x) <= 0.4 && Math.abs(localPoint.z) <= 0.4) {
      const col = Math.min(7, Math.max(0, Math.floor((localPoint.x + 0.4) / 0.1)));
      const row = Math.min(7, Math.max(0, Math.floor((0.4 - localPoint.z) / 0.1)));
      const square = `${FILES[col]}${row + 1}`;
      handleSelect(square);
    }
  };

  return (
    <>
      <color attach="background" args={['#cfe2f3']} />
      <fog attach="fog" args={['#cfe2f3', 3.5, 11]} />
      <Sky sunPosition={[40, 18, -30]} turbidity={6} rayleigh={1.5} />
      <Suspense fallback={null}>
        <Environment preset="park" background={false} />
      </Suspense>
      <ambientLight intensity={0.62} />
      <hemisphereLight args={['#fff8eb', '#3a5a28', 0.65]} />
      {/* Luz direccional cálida tipo sol de tarde (#fff4e0) con sombras suaves */}
      <directionalLight
        color="#fff4e0"
        position={[1.8, 2.6, -1.4]}
        intensity={1.75}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0003}
        shadow-camera-near={0.2}
        shadow-camera-far={8}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-1.6}
      />
      <directionalLight position={[-1.4, 1.4, 1.5]} intensity={0.55} color="#fff4e0" />

      <group
        ref={boardGroupRef}
        rotation={[0, orientation === 'black' ? Math.PI : 0, 0]}
      >
        <Suspense fallback={null}>
          <EnvironmentModels
            boardGroupRef={boardGroupRef}
            occupiedSquares={occupiedSquares}
            butterflyLandingTargets={butterflyLandingTargets}
            onBoardPointClick={handleBoardPointClick}
          />
        </Suspense>

        {/* Partículas ligeras (~85) flotando lentamente como polen/motas de luz */}
        <PollenParticles />

        {/* Sombra de nubes/copa de árbol deslizándose suavemente sobre el tablero */}
        <MovingCanopyShadow />

        {/* Resaltados de casillas (selección, último movimiento, jaque y jugadas legales) en Y = 0.034 */}
        {squares.map(({ square, x, z }) => {
          const isSelected = selectedSquare === square;
          const isLastMove =
            lastMove?.from === square || lastMove?.to === square;
          const isInCheck = kingInCheckSquare === square;
          const isLegalTarget = legalTargetCaptureMap.has(square);
          const isCaptureTarget = legalTargetCaptureMap.get(square) === true;

          let highlightColor: string | null = null;
          let highlightOpacity = 0;
          if (isInCheck) {
            highlightColor = '#dc2626';
            highlightOpacity = 0.65;
          } else if (isSelected) {
            highlightColor = '#d4a359';
            highlightOpacity = 0.55;
          } else if (isLastMove) {
            highlightColor = '#eab308';
            highlightOpacity = 0.35;
          }

          return (
            <group key={square} position={[x, BOARD_SURFACE_Y, z]}>
              {highlightOpacity > 0 ? (
                <mesh
                  position={[0, 0.0005, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelect(square);
                  }}
                >
                  <planeGeometry args={[SQUARE_SIZE, SQUARE_SIZE]} />
                  <meshBasicMaterial
                    color={highlightColor ?? '#ffffff'}
                    transparent
                    opacity={highlightOpacity}
                    depthWrite={false}
                  />
                </mesh>
              ) : null}

              {isLegalTarget ? (
                <LegalMoveIndicator
                  isCaptureTarget={isCaptureTarget}
                  onSelect={() => handleSelect(square)}
                />
              ) : null}
            </group>
          );
        })}

        {/* Piezas 3D apoyadas en Y = 0.034 */}
        <Suspense fallback={null}>
          {Object.entries(positionMap).map(([square, piece]) => {
            const isMovedPiece = lastMove?.to === square;
            return (
              <ChessPieceModel
                key={`${pieceStyle}-${square}-${piece.pieceType}`}
                pieceKey={piece.pieceType}
                pieceStyle={pieceStyle}
                square={square}
                isSelected={selectedSquare === square}
                moveFromSquare={isMovedPiece ? lastMove.from : null}
                isCaptureMove={isMovedPiece && lastMoveWasCapture}
                onSelectSquare={handleSelect}
              />
            );
          })}
        </Suspense>

        {captureBurst ? (
          <CaptureBurstEffect
            key={captureBurst.key}
            position={captureBurst.position}
          />
        ) : null}
      </group>

      <OrbitControls
        ref={orbitControlsRef}
        target={[0, BOARD_SURFACE_Y, 0]}
        enablePan={false}
        minDistance={0.65}
        maxDistance={2.2}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.08}
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: undefined,
          TWO: THREE.TOUCH.DOLLY_ROTATE,
        }}
      />
    </>
  );
}

export function ChessBoard3DView({
  fen,
  orientation,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  isInteractionDisabled,
  selectedSquare,
  pendingPromotion,
  gameOverBanner = null,
  canFlipBoard = false,
  pieceStyle = 'classic',
  onFlipBoard,
  onRestartMatch,
  onOpenSetupModal,
  onDismissGameOver,
  onReturnToLobby,
  onSquareSelect,
  onSelectPromotion,
  onCancelPromotion,
}: ChessBoard3DViewProps) {
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [resetViewTrigger, setResetViewTrigger] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardContainerRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = async () => {
    const container = boardContainerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen rejections (e.g. unsupported environment)
    }
  };

  useEffect(() => {
    if (!pendingPromotion) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelPromotion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingPromotion, onCancelPromotion]);

  return (
    <div className="flex w-full flex-col gap-2">
      {canFlipBoard && onFlipBoard ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onFlipBoard}
            aria-label="Rotar tablero"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surfaceElevated px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-none stroke-current"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            Rotar tablero
          </button>
        </div>
      ) : null}

      <div
        ref={boardContainerRef}
        className={`relative w-full border border-brand-border bg-brand-surface shadow-board select-none ${
          isFullscreen
            ? 'h-screen w-screen rounded-none p-0'
            : 'aspect-square rounded-xl p-1'
        }`}
      >
        <div
          data-testid="chessboard-3d-canvas"
          onContextMenu={(event) => event.preventDefault()}
          className="relative h-full w-full overflow-hidden rounded-lg bg-[#0d0e12]"
        >
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setResetViewTrigger((prev) => prev + 1)}
              aria-label="Centrar cámara"
              title="Centrar cámara"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border/90 bg-brand-surface/85 px-2.5 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur-md transition hover:border-brand-gold/60 hover:bg-brand-surfaceElevated hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fill-none stroke-current"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              </svg>
              <span>Centrar</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={
                isFullscreen
                  ? 'Salir de pantalla completa'
                  : 'Pantalla completa'
              }
              aria-pressed={isFullscreen}
              title={
                isFullscreen
                  ? 'Salir de pantalla completa'
                  : 'Pantalla completa'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border/90 bg-brand-surface/85 px-2.5 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur-md transition hover:border-brand-gold/60 hover:bg-brand-surfaceElevated hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
            >
              {isFullscreen ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 fill-none stroke-current"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 fill-none stroke-current"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2 2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
              <span>{isFullscreen ? 'Salir' : 'Pantalla completa'}</span>
            </button>
          </div>

          <Canvas
            shadows
            style={{ width: '100%', height: '100%', display: 'block' }}
            camera={{
              position: DEFAULT_CAMERA_POSITION,
              fov: 44,
              near: 0.02,
              far: 30,
            }}
            dpr={[1, 2]}
          >
            <BoardScene
              fen={fen}
              orientation={orientation}
              legalMoves={legalMoves}
              lastMove={lastMove}
              kingInCheckSquare={kingInCheckSquare}
              selectedSquare={selectedSquare}
              isInteractionDisabled={isInteractionDisabled}
              hasPendingPromotion={pendingPromotion !== null}
              pieceStyle={pieceStyle}
              resetViewTrigger={resetViewTrigger}
              onSquareSelect={onSquareSelect}
            />
          </Canvas>

          {pendingPromotion ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-background/80 p-4 backdrop-blur-xs">
              <button
                type="button"
                aria-label="Cerrar selector de promoción"
                onClick={onCancelPromotion}
                className="absolute inset-0 cursor-default"
                tabIndex={-1}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="promotion-dialog-title"
                className="relative z-10 w-full max-w-xs rounded-xl border border-brand-gold/40 bg-brand-surface p-4 shadow-2xl"
              >
                <h3
                  id="promotion-dialog-title"
                  className="mb-3 text-center text-sm font-semibold text-neutral-100"
                >
                  Elige pieza de promoción
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  {PROMOTION_OPTIONS.map(({ piece, label }) => {
                    const pieceKey = `${pendingPromotion.color}${piece.toUpperCase()}`;
                    const PieceIcon = defaultPieces[pieceKey];
                    return (
                      <button
                        key={piece}
                        type="button"
                        data-promotion={piece}
                        aria-label={label}
                        onClick={() => onSelectPromotion(piece)}
                        className="flex flex-col items-center justify-center gap-1 rounded-lg border border-brand-border bg-brand-surfaceElevated p-3 text-xs font-semibold text-neutral-100 transition hover:border-brand-gold hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
                      >
                        {PieceIcon ? (
                          <PieceIcon svgStyle={{ width: '44px', height: '44px' }} />
                        ) : null}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onCancelPromotion}
                  className="mt-3 w-full rounded-lg border border-brand-border bg-brand-surfaceElevated/60 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {gameOverBanner ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-20 flex items-center justify-center bg-brand-background/80 p-4 backdrop-blur-xs"
            >
              <div className="relative w-full max-w-sm rounded-2xl border border-brand-gold/50 bg-brand-surface/95 p-6 text-center shadow-2xl">
                {onDismissGameOver ? (
                  <button
                    type="button"
                    onClick={onDismissGameOver}
                    aria-label="Ver tablero"
                    title="Ver tablero"
                    className="absolute top-3 right-3 rounded-lg border border-brand-border bg-brand-surfaceElevated p-1.5 text-neutral-400 transition hover:border-neutral-600 hover:text-white"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <p className="font-editorial text-2xl font-bold text-white">
                  {gameOverBanner.title}
                </p>
                <p className="mt-1.5 text-sm text-brand-goldLight">
                  {gameOverBanner.subtitle}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {onReturnToLobby ? (
                    <button
                      type="button"
                      onClick={onReturnToLobby}
                      className="rounded-lg bg-brand-gold px-5 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-brand-goldLight sm:text-sm"
                    >
                      Volver a la sala
                    </button>
                  ) : (
                    <>
                      {onRestartMatch ? (
                        <button
                          type="button"
                          onClick={onRestartMatch}
                          className="rounded-lg border border-brand-border bg-brand-surfaceElevated px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800 sm:text-sm"
                        >
                          Reiniciar
                        </button>
                      ) : null}
                      {onOpenSetupModal ? (
                        <button
                          type="button"
                          onClick={onOpenSetupModal}
                          className="rounded-lg bg-brand-gold px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-brand-goldLight sm:text-sm"
                        >
                          Nueva partida
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
