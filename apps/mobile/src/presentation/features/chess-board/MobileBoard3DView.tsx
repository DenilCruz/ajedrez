import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { PromotionPiece } from '@chess-platform/shared-domain';
import type { MobileBoardViewProps } from './MobileBoardView';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const SQUARE_SIZE = 0.1;
const BOARD_TOP_Y = 0.02;

const PROMOTION_OPTIONS: ReadonlyArray<{ piece: PromotionPiece; label: string }> = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Alfil' },
  { piece: 'n', label: 'Caballo' },
];

type PieceKind = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';

interface ParsedPiece {
  square: string;
  color: 'w' | 'b';
  kind: PieceKind;
}

function parseFenBoard(fen: string): ParsedPiece[] {
  const placement = fen.split(' ')[0] ?? '';
  const ranks = placement.split('/');
  const result: ParsedPiece[] = [];

  for (let r = 0; r < 8; r += 1) {
    const row = ranks[r] ?? '';
    let fileIdx = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        fileIdx += Number(ch);
      } else {
        const file = FILES[fileIdx];
        const rank = 8 - r;
        if (file) {
          const isWhite = ch === ch.toUpperCase();
          result.push({
            square: `${file}${rank}`,
            color: isWhite ? 'w' : 'b',
            kind: ch.toLowerCase() as PieceKind,
          });
        }
        fileIdx += 1;
      }
    }
  }
  return result;
}

function squareToWorld(square: string): [number, number] {
  const fileIdx = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  const x = (fileIdx - 3.5) * SQUARE_SIZE;
  const z = (4.5 - rank) * SQUARE_SIZE;
  return [x, z];
}

function createLatheGeometry(points: Array<[number, number]>, segments = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function buildPieceGeometryGroup(
  kind: PieceKind,
  material: THREE.Material,
  shadowMaterial: THREE.Material,
  isBlack: boolean,
): THREE.Group {
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.036, 18), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0008;
  group.add(shadow);

  if (kind === 'p') {
    const body = new THREE.Mesh(
      createLatheGeometry([
        [0.028, 0],
        [0.029, 0.008],
        [0.022, 0.014],
        [0.015, 0.028],
        [0.011, 0.045],
        [0.015, 0.049],
        [0.011, 0.052],
        [0.001, 0.052],
      ]),
      material,
    );
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 14), material);
    head.position.y = 0.062;
    group.add(body, head);
    return group;
  }

  if (kind === 'r') {
    const body = new THREE.Mesh(
      createLatheGeometry([
        [0.031, 0],
        [0.032, 0.009],
        [0.024, 0.016],
        [0.019, 0.052],
        [0.024, 0.060],
        [0.024, 0.072],
        [0.001, 0.072],
      ]),
      material,
    );
    group.add(body);
    for (let i = 0; i < 4; i += 1) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.009, 0.01), material);
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      merlon.position.set(Math.cos(angle) * 0.017, 0.076, Math.sin(angle) * 0.017);
      merlon.rotation.y = -angle;
      group.add(merlon);
    }
    return group;
  }

  if (kind === 'n') {
    const base = new THREE.Mesh(
      createLatheGeometry([
        [0.031, 0],
        [0.032, 0.009],
        [0.024, 0.016],
        [0.021, 0.024],
        [0.001, 0.024],
      ]),
      material,
    );
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.038, 0.026), material);
    neck.position.set(0, 0.04, 0.003);
    neck.rotation.x = 0.22;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.036), material);
    head.position.set(0, 0.064, -0.006);
    head.rotation.x = -0.35;

    const ears = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.016, 4), material);
    ears.position.set(0, 0.078, 0.006);

    const knightGroup = new THREE.Group();
    knightGroup.add(base, neck, head, ears);
    if (isBlack) {
      knightGroup.rotation.y = Math.PI;
    }
    group.add(knightGroup);
    return group;
  }

  if (kind === 'b') {
    const body = new THREE.Mesh(
      createLatheGeometry([
        [0.03, 0],
        [0.031, 0.009],
        [0.023, 0.016],
        [0.015, 0.044],
        [0.019, 0.052],
        [0.012, 0.057],
        [0.016, 0.072],
        [0.007, 0.086],
        [0.001, 0.088],
      ]),
      material,
    );
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 10), material);
    finial.position.y = 0.092;
    group.add(body, finial);
    return group;
  }

  if (kind === 'q') {
    const body = new THREE.Mesh(
      createLatheGeometry([
        [0.033, 0],
        [0.034, 0.01],
        [0.025, 0.018],
        [0.016, 0.056],
        [0.022, 0.066],
        [0.015, 0.072],
        [0.022, 0.088],
        [0.001, 0.088],
      ]),
      material,
    );
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 12), material);
    crown.position.y = 0.095;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 10), material);
    tip.position.y = 0.108;
    group.add(body, crown, tip);
    return group;
  }

  // King
  const body = new THREE.Mesh(
    createLatheGeometry([
      [0.034, 0],
      [0.035, 0.011],
      [0.026, 0.019],
      [0.017, 0.062],
      [0.024, 0.072],
      [0.016, 0.078],
      [0.022, 0.095],
      [0.001, 0.095],
    ]),
    material,
  );
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.006), material);
  crossV.position.y = 0.106;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.006), material);
  crossH.position.y = 0.108;
  group.add(body, crossV, crossH);
  return group;
}

interface ButterflyState {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  angle: number;
  speed: number;
  radius: number;
  heightBase: number;
  pauseTimer: number;
  flapPhase: number;
}

export function MobileBoard3DView({
  fen,
  theme,
  orientation,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  selectedSquare,
  pendingPromotion,
  gameOverCopy,
  isOnlineMatch,
  onSquarePress,
  onSelectPromotion,
  onCancelPromotion,
  onReturnToLobby,
  onRestartLocal,
}: MobileBoardViewProps) {
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - 24, 430);
  const [contextReady, setContextReady] = useState(false);

  // Camera spherical coordinates
  const sphericalRef = useRef({
    azimuth: orientation === 'black' ? Math.PI : 0,
    polar: 0.68,
    radius: 1.18,
  });

  // Latest props synced to refs so GL loop always reads fresh state
  const latestPropsRef = useRef({
    fen,
    theme,
    orientation,
    legalMoves,
    lastMove,
    kingInCheckSquare,
    selectedSquare,
    onSquarePress,
  });
  latestPropsRef.current = {
    fen,
    theme,
    orientation,
    legalMoves,
    lastMove,
    kingInCheckSquare,
    selectedSquare,
    onSquarePress,
  };

  // Three.js scene refs
  const sceneDataRef = useRef<{
    camera: THREE.PerspectiveCamera;
    squareMeshes: Map<string, THREE.Mesh>;
    squareMats: Map<string, THREE.MeshStandardMaterial>;
    highlightGroup: THREE.Group;
    piecesGroup: THREE.Group;
    pieceInstances: Map<string, { group: THREE.Group; targetX: number; targetZ: number }>;
    whiteMat: THREE.MeshStandardMaterial;
    blackMat: THREE.MeshStandardMaterial;
    shadowMat: THREE.MeshBasicMaterial;
    raycaster: THREE.Raycaster;
    lastSyncKey: string;
    lastThemeKey: string;
  } | null>(null);

  const rafRef = useRef<number | null>(null);
  const viewSizeRef = useRef({ width: boardPx, height: boardPx });
  viewSizeRef.current = { width: boardPx, height: boardPx };

  const resetCamera = useCallback(() => {
    sphericalRef.current = {
      azimuth: latestPropsRef.current.orientation === 'black' ? Math.PI : 0,
      polar: 0.68,
      radius: 1.18,
    };
  }, []);

  useEffect(() => {
    sphericalRef.current.azimuth = orientation === 'black' ? Math.PI : 0;
  }, [orientation]);

  // Sync theme colors
  useEffect(() => {
    const data = sceneDataRef.current;
    if (!data) return;
    for (let r = 0; r < 8; r += 1) {
      for (let f = 0; f < 8; f += 1) {
        const sq = `${FILES[f]}${8 - r}`;
        const mat = data.squareMats.get(sq);
        if (mat) {
          const isLight = (r + f) % 2 === 0;
          mat.color.set(isLight ? theme.lightSquare : theme.darkSquare);
        }
      }
    }
  }, [theme, contextReady]);

  // Sync pieces & square highlights when board state changes
  const legalMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const mv of legalMoves) {
      m.set(mv.to, (m.get(mv.to) ?? false) || mv.san.includes('x'));
    }
    return m;
  }, [legalMoves]);

  useEffect(() => {
    const data = sceneDataRef.current;
    if (!data) return;

    // Rebuild highlights
    while (data.highlightGroup.children.length > 0) {
      const child = data.highlightGroup.children[0];
      data.highlightGroup.remove(child);
    }

    const addSquareOverlay = (square: string, color: string, opacity: number, yOffset: number) => {
      const [x, z] = squareToWorld(square);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(SQUARE_SIZE * 0.94, SQUARE_SIZE * 0.94),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, BOARD_TOP_Y + yOffset, z);
      data.highlightGroup.add(mesh);
    };

    if (lastMove) {
      addSquareOverlay(lastMove.from, '#eab308', 0.32, 0.0004);
      addSquareOverlay(lastMove.to, '#eab308', 0.38, 0.0004);
    }
    if (selectedSquare) {
      addSquareOverlay(selectedSquare, '#d4af37', 0.55, 0.0006);
    }
    if (kingInCheckSquare) {
      addSquareOverlay(kingInCheckSquare, '#ef4444', 0.58, 0.0007);
    }

    for (const [toSquare, isCapture] of legalMap.entries()) {
      const [x, z] = squareToWorld(toSquare);
      if (isCapture) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.032, 0.044, 24),
          new THREE.MeshBasicMaterial({
            color: '#d4af37',
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, BOARD_TOP_Y + 0.0009, z);
        data.highlightGroup.add(ring);
      } else {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.015, 18),
          new THREE.MeshBasicMaterial({
            color: '#d4af37',
            transparent: true,
            opacity: 0.78,
          }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, BOARD_TOP_Y + 0.0009, z);
        data.highlightGroup.add(dot);
      }
    }

    // Rebuild pieces cleanly for current FEN
    while (data.piecesGroup.children.length > 0) {
      const child = data.piecesGroup.children[0];
      data.piecesGroup.remove(child);
    }
    data.pieceInstances.clear();

    const pieces = parseFenBoard(fen);
    for (const p of pieces) {
      const [x, z] = squareToWorld(p.square);
      const isBlack = p.color === 'b';
      const pieceGroup = buildPieceGeometryGroup(
        p.kind,
        isBlack ? data.blackMat : data.whiteMat,
        data.shadowMat,
        isBlack,
      );
      pieceGroup.position.set(x, BOARD_TOP_Y, z);
      data.piecesGroup.add(pieceGroup);
      data.pieceInstances.set(p.square, { group: pieceGroup, targetX: x, targetZ: z });
    }
  }, [fen, selectedSquare, lastMove, kingInCheckSquare, legalMap, contextReady]);

  // Touch / Orbit / Pinch / Tap handling
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    movedDistance: 0,
    initialPinchDist: 0,
    initialRadius: 1.24,
  });

  const handleTap = useCallback((locationX: number, locationY: number) => {
    const data = sceneDataRef.current;
    if (!data) return;
    const { width: w, height: h } = viewSizeRef.current;
    if (w <= 0 || h <= 0) return;

    const ndcX = (locationX / w) * 2 - 1;
    const ndcY = -(locationY / h) * 2 + 1;
    data.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), data.camera);

    const targets = Array.from(data.squareMeshes.values());
    const hits = data.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      const sq = hits[0].object.userData.square as string | undefined;
      if (sq) {
        latestPropsRef.current.onSquarePress(sq);
      }
    }
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          const t0 = touches[0];
          gestureRef.current.startX = t0?.pageX ?? 0;
          gestureRef.current.startY = t0?.pageY ?? 0;
          gestureRef.current.lastX = t0?.pageX ?? 0;
          gestureRef.current.lastY = t0?.pageY ?? 0;
          gestureRef.current.movedDistance = 0;

          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            gestureRef.current.initialPinchDist = Math.hypot(dx, dy);
            gestureRef.current.initialRadius = sphericalRef.current.radius;
          } else {
            gestureRef.current.initialPinchDist = 0;
          }
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.hypot(dx, dy);
            if (gestureRef.current.initialPinchDist > 10) {
              const scale = gestureRef.current.initialPinchDist / Math.max(dist, 10);
              sphericalRef.current.radius = Math.min(
                2.05,
                Math.max(0.72, gestureRef.current.initialRadius * scale),
              );
            }
            gestureRef.current.movedDistance = 999;
            return;
          }

          const t0 = touches[0];
          if (!t0) return;
          const dx = t0.pageX - gestureRef.current.lastX;
          const dy = t0.pageY - gestureRef.current.lastY;
          gestureRef.current.lastX = t0.pageX;
          gestureRef.current.lastY = t0.pageY;
          gestureRef.current.movedDistance += Math.hypot(dx, dy);

          sphericalRef.current.azimuth -= dx * 0.008;
          sphericalRef.current.polar = Math.min(
            1.28,
            Math.max(0.28, sphericalRef.current.polar - dy * 0.007),
          );
        },
        onPanResponderRelease: (evt) => {
          if (gestureRef.current.movedDistance < 10) {
            const { locationX, locationY } = evt.nativeEvent;
            handleTap(locationX, locationY);
          }
        },
      }),
    [handleTap],
  );

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const canvas = {
      width: w,
      height: h,
      clientWidth: w,
      clientHeight: h,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: (type: string) =>
        type === 'webgl2' || type === 'experimental-webgl2' || type === 'webgl'
          ? gl
          : null,
    } as unknown as HTMLCanvasElement;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#132219');
    scene.fog = new THREE.Fog('#132219', 2.6, 5.5);

    const camera = new THREE.PerspectiveCamera(42, w / Math.max(h, 1), 0.05, 20);

    // Lighting
    const ambient = new THREE.AmbientLight('#fff8eb', 0.85);
    const hemi = new THREE.HemisphereLight('#e6f2ff', '#284a2a', 0.75);
    const dirLight = new THREE.DirectionalLight('#fff6e0', 1.6);
    dirLight.position.set(1.2, 2.2, 1.4);
    const rimLight = new THREE.DirectionalLight('#b4d0ff', 0.55);
    rimLight.position.set(-1.3, 1.2, -1.2);
    scene.add(ambient, hemi, dirLight, rimLight);

    // Meadow ground
    const meadow = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshStandardMaterial({ color: '#275229', roughness: 0.92 }),
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.016;
    scene.add(meadow);

    // Subtle wildflowers around the clearing
    const flowerGeo = new THREE.CircleGeometry(0.015, 6);
    const flowerWhiteMat = new THREE.MeshBasicMaterial({ color: '#f4f1de', side: THREE.DoubleSide });
    const flowerGoldMat = new THREE.MeshBasicMaterial({ color: '#f2cc8f', side: THREE.DoubleSide });
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.2;
      const dist = 0.64 + (i % 5) * 0.24;
      const flower = new THREE.Mesh(
        flowerGeo,
        i % 2 === 0 ? flowerWhiteMat : flowerGoldMat,
      );
      flower.rotation.x = -Math.PI / 2;
      flower.position.set(Math.cos(a) * dist, -0.014, Math.sin(a) * dist);
      scene.add(flower);
    }

    // Wooden board frame (top at Y = 0.014, strictly below squares at Y = 0.020)
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.028, 0.92),
      new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.5, metalness: 0.08 }),
    );
    frame.position.y = 0.0;
    scene.add(frame);

    const goldTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.824, 0.03, 0.824),
      new THREE.MeshStandardMaterial({ color: '#c49a3a', roughness: 0.32, metalness: 0.55 }),
    );
    goldTrim.position.y = 0.0;
    scene.add(goldTrim);

    // 64 Squares (top surface at Y = BOARD_TOP_Y = 0.020)
    const squareMeshes = new Map<string, THREE.Mesh>();
    const squareMats = new Map<string, THREE.MeshStandardMaterial>();
    const squareGeo = new THREE.BoxGeometry(SQUARE_SIZE, 0.008, SQUARE_SIZE);
    const currentTheme = latestPropsRef.current.theme;

    for (let r = 0; r < 8; r += 1) {
      for (let f = 0; f < 8; f += 1) {
        const sq = `${FILES[f]}${8 - r}`;
        const isLight = (r + f) % 2 === 0;
        const mat = new THREE.MeshStandardMaterial({
          color: isLight ? currentTheme.lightSquare : currentTheme.darkSquare,
          roughness: 0.48,
          metalness: 0.04,
        });
        const mesh = new THREE.Mesh(squareGeo, mat);
        const [x, z] = squareToWorld(sq);
        mesh.position.set(x, BOARD_TOP_Y - 0.004, z);
        mesh.userData.square = sq;
        scene.add(mesh);
        squareMeshes.set(sq, mesh);
        squareMats.set(sq, mat);
      }
    }

    const highlightGroup = new THREE.Group();
    const piecesGroup = new THREE.Group();
    scene.add(highlightGroup, piecesGroup);

    // Butterflies
    const butterflies: ButterflyState[] = [];
    const wingGeo = new THREE.PlaneGeometry(0.022, 0.015);
    const butterflyColors = ['#f59e0b', '#38bdf8', '#f472b6'];
    for (let i = 0; i < 3; i += 1) {
      const bGroup = new THREE.Group();
      const wingMat = new THREE.MeshBasicMaterial({
        color: butterflyColors[i],
        side: THREE.DoubleSide,
      });
      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.x = -0.011;
      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.x = 0.011;
      bGroup.add(leftWing, rightWing);
      scene.add(bGroup);
      butterflies.push({
        group: bGroup,
        leftWing,
        rightWing,
        angle: i * 2.1,
        speed: 0.35 + i * 0.08,
        radius: 0.34 + i * 0.11,
        heightBase: 0.18 + i * 0.04,
        pauseTimer: 0,
        flapPhase: i * 1.4,
      });
    }

    const whiteMat = new THREE.MeshStandardMaterial({
      color: '#f2ead8',
      roughness: 0.32,
      metalness: 0.08,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: '#25211e',
      roughness: 0.34,
      metalness: 0.14,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.28,
    });

    sceneDataRef.current = {
      camera,
      squareMeshes,
      squareMats,
      highlightGroup,
      piecesGroup,
      pieceInstances: new Map(),
      whiteMat,
      blackMat,
      shadowMat,
      raycaster: new THREE.Raycaster(),
      lastSyncKey: '',
      lastThemeKey: '',
    };

    setContextReady(true);

    let lastTime = Date.now();
    const renderLoop = () => {
      const now = Date.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const { azimuth, polar, radius } = sphericalRef.current;
      camera.position.set(
        radius * Math.sin(polar) * Math.sin(azimuth),
        radius * Math.cos(polar),
        radius * Math.sin(polar) * Math.cos(azimuth),
      );
      camera.lookAt(0, 0.02, 0);

      for (const b of butterflies) {
        b.angle += b.speed * dt;
        b.flapPhase += dt * 14;
        const flap = Math.sin(b.flapPhase) * 0.75;
        b.leftWing.rotation.y = flap;
        b.rightWing.rotation.y = -flap;
        b.group.position.set(
          Math.cos(b.angle) * b.radius,
          b.heightBase + Math.sin(b.flapPhase * 0.35) * 0.03,
          Math.sin(b.angle) * b.radius,
        );
        b.group.rotation.y = -b.angle;
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
      rafRef.current = requestAnimationFrame(renderLoop);
    };
    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      sceneDataRef.current = null;
    };
  }, []);

  return (
    <View style={[styles.wrapper, { width: boardPx, height: boardPx }]}>
      <View style={styles.glContainer} {...panResponder.panHandlers}>
        <GLView style={styles.glView} onContextCreate={onContextCreate} />
      </View>

      <Pressable onPress={resetCamera} style={styles.centerCamBtn}>
        <Text style={styles.centerCamText}>Centrar</Text>
      </Pressable>

      {pendingPromotion && (
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Elige pieza de promoción</Text>
            <View style={styles.promoRow}>
              {PROMOTION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.piece}
                  onPress={() => onSelectPromotion(opt.piece)}
                  style={styles.promoBtn}
                >
                  <Text style={styles.promoLabel}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onCancelPromotion} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {gameOverCopy && (
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{gameOverCopy.title}</Text>
            <Text style={styles.modalSubtitle}>{gameOverCopy.subtitle}</Text>
            <Pressable
              onPress={isOnlineMatch ? onReturnToLobby : onRestartLocal}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>
                {isOnlineMatch ? 'Volver a la sala' : 'Jugar de nuevo'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#26262c',
    backgroundColor: '#0c1410',
  },
  glContainer: {
    flex: 1,
  },
  glView: {
    flex: 1,
  },
  centerCamBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(18, 18, 22, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  centerCamText: {
    color: '#d4af37',
    fontSize: 12,
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(10, 10, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#141418',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    padding: 18,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    color: '#f4f4f6',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
  },
  promoRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  promoBtn: {
    backgroundColor: '#1e1e24',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  promoLabel: {
    color: '#e5c158',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#d4af37',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#0a0a0c',
    fontSize: 14,
    fontWeight: '700',
  },
});
