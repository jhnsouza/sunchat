import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Text } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

export type Peer = {
  id: string;
  name: string;
  x: number;
  z: number;
  message?: string | null;
  messageAt?: number;
};

export type MoveState = { x: number; z: number; angle: number };

const WORLD = 120;
const SPEED = 7;

/** Soft grass texture so the pasture is never a flat single color. */
function useGrassTexture() {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#6aa84f";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const l = 3 + Math.random() * 7;
      ctx.strokeStyle = `hsl(${95 + Math.random() * 25} ${45 + Math.random() * 25}% ${28 + Math.random() * 30}%)`;
      ctx.lineWidth = 1 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - l);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(34, 34);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Clouds() {
  const puffs = useMemo(
    () =>
      Array.from({ length: 26 }, () => ({
        x: (Math.random() - 0.5) * WORLD * 1.6,
        y: 16 + Math.random() * 14,
        z: (Math.random() - 0.5) * WORLD * 1.6,
        s: 4 + Math.random() * 6,
        drift: 0.2 + Math.random() * 0.5,
      })),
    [],
  );
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    g.children.forEach((child, i) => {
      child.position.x += puffs[i]!.drift * dt;
      if (child.position.x > WORLD) child.position.x = -WORLD;
    });
  });
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} scale={p.s}>
          <mesh>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#ffffff" roughness={1} />
          </mesh>
          <mesh position={[1.1, -0.25, 0.2]} scale={0.75}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f7fbff" roughness={1} />
          </mesh>
          <mesh position={[-1.05, -0.3, -0.15]} scale={0.65}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f2f8ff" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Scenery() {
  const props = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        x: (Math.random() - 0.5) * WORLD * 1.7,
        z: (Math.random() - 0.5) * WORLD * 1.7,
        s: 0.7 + Math.random() * 1.3,
        tree: Math.random() > 0.35,
      })),
    [],
  );
  return (
    <group>
      {props.map((p, i) =>
        p.tree ? (
          <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
            <mesh position={[0, 1.4, 0]} castShadow>
              <cylinderGeometry args={[0.26, 0.36, 2.8, 8]} />
              <meshStandardMaterial color="#7a5230" roughness={0.9} />
            </mesh>
            <mesh position={[0, 3.6, 0]} castShadow>
              <icosahedronGeometry args={[1.7, 1]} />
              <meshStandardMaterial color="#3f7d3a" roughness={0.85} />
            </mesh>
          </group>
        ) : (
          <mesh key={i} position={[p.x, 0.35 * p.s, p.z]} scale={p.s} castShadow>
            <dodecahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.95} />
          </mesh>
        ),
      )}
    </group>
  );
}

function CloudAvatar({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.85, 20, 20]} />
        <meshStandardMaterial color={tint} roughness={0.55} />
      </mesh>
      <mesh position={[0.75, -0.28, 0]} castShadow>
        <sphereGeometry args={[0.58, 18, 18]} />
        <meshStandardMaterial color="#f4d03f" roughness={0.55} />
      </mesh>
      <mesh position={[-0.78, -0.3, 0]} castShadow>
        <sphereGeometry args={[0.52, 18, 18]} />
        <meshStandardMaterial color="#63c264" roughness={0.55} />
      </mesh>
    </group>
  );
}

function Label({ name, message }: { name: string; message?: string | null }) {
  return (
    <group position={[0, 1.5, 0]}>
      <Text fontSize={0.4} color="#0f2740" anchorY="bottom" outlineWidth={0.035} outlineColor="#ffffff">
        {name}
      </Text>
      {message ? (
        <Text
          position={[0, 0.75, 0]}
          fontSize={0.42}
          maxWidth={6}
          color="#ffffff"
          anchorY="bottom"
          outlineWidth={0.05}
          outlineColor="#1b4f8a"
        >
          {message}
        </Text>
      ) : null}
    </group>
  );
}

/** Local player: keyboard + joystick movement with a chase camera. */
function Player({
  moveRef,
  inputRef,
  name,
  message,
  onMove,
}: {
  moveRef: React.MutableRefObject<MoveState>;
  inputRef: React.MutableRefObject<{ x: number; z: number }>;
  name: string;
  message?: string | null;
  onMove: (state: MoveState) => void;
}) {
  const body = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();
  const lastSent = useRef(0);

  useMemo(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = keys.current;
    let ix = inputRef.current.x;
    let iz = inputRef.current.z;
    if (k["a"] || k["arrowleft"]) ix -= 1;
    if (k["d"] || k["arrowright"]) ix += 1;
    if (k["w"] || k["arrowup"]) iz -= 1;
    if (k["s"] || k["arrowdown"]) iz += 1;
    const len = Math.hypot(ix, iz);
    const state = moveRef.current;
    if (len > 0.05) {
      ix /= len;
      iz /= len;
      state.x = THREE.MathUtils.clamp(state.x + ix * SPEED * dt, -WORLD, WORLD);
      state.z = THREE.MathUtils.clamp(state.z + iz * SPEED * dt, -WORLD, WORLD);
      state.angle = Math.atan2(ix, iz);
    }

    const g = body.current;
    if (g) {
      g.position.set(state.x, 1.1 + Math.sin(performance.now() / 420) * 0.08, state.z);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.angle, 1 - Math.exp(-10 * dt));
    }

    const target = new THREE.Vector3(state.x, 4.2, state.z + 9.5);
    camera.position.lerp(target, 1 - Math.exp(-5 * dt));
    camera.lookAt(state.x, 1.4, state.z);

    const now = performance.now();
    if (now - lastSent.current > 120) {
      lastSent.current = now;
      onMove({ ...state });
    }
  });

  return (
    <group ref={body}>
      <CloudAvatar tint="#5bb8f5" />
      <Label name={name} message={message} />
    </group>
  );
}

function PeerAvatar({ peer }: { peer: Peer }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const node = g.current;
    if (!node) return;
    const dt = Math.min(delta, 0.05);
    const t = 1 - Math.exp(-8 * dt);
    node.position.x = THREE.MathUtils.lerp(node.position.x, peer.x, t);
    node.position.z = THREE.MathUtils.lerp(node.position.z, peer.z, t);
    node.position.y = 1.1 + Math.sin(performance.now() / 520) * 0.08;
  });
  return (
    <group ref={g} position={[peer.x, 1.1, peer.z]}>
      <CloudAvatar tint="#9fe0a6" />
      <Label name={peer.name} message={peer.message} />
    </group>
  );
}

function Ground() {
  const grass = useGrassTexture();
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[WORLD * 2.4, WORLD * 2.4]} />
      <meshStandardMaterial map={grass} roughness={0.95} />
    </mesh>
  );
}

export function UniverseScene({
  moveRef,
  inputRef,
  name,
  myMessage,
  peers,
  onMove,
}: {
  moveRef: React.MutableRefObject<MoveState>;
  inputRef: React.MutableRefObject<{ x: number; z: number }>;
  name: string;
  myMessage?: string | null;
  peers: Peer[];
  onMove: (state: MoveState) => void;
}) {
  return (
    <Canvas shadows camera={{ position: [0, 5, 12], fov: 60 }} dpr={[1, 2]}>
      <color attach="background" args={["#8ecbf5"]} />
      <fog attach="fog" args={["#a9d8f7", 60, 190]} />
      <hemisphereLight args={["#cfe9ff", "#5c8a4a", 0.8]} />
      <directionalLight
        position={[30, 40, 20]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Suspense fallback={null}>
        <Environment>
          <Lightformer intensity={2} position={[0, 8, 0]} scale={[14, 14, 1]} />
          <Lightformer intensity={0.9} color="#bfe4ff" position={[-8, 2, -2]} rotation-y={Math.PI / 2} scale={[24, 2, 1]} />
        </Environment>
        <Ground />
        <Scenery />
        <Clouds />
        <Player moveRef={moveRef} inputRef={inputRef} name={name} message={myMessage} onMove={onMove} />
        {peers.map((p) => (
          <PeerAvatar key={p.id} peer={p} />
        ))}
      </Suspense>
    </Canvas>
  );
}
