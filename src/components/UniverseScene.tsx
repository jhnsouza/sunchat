import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Text, useTexture } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import grassAsset from "@/assets/grass.jpg.asset.json";
import skyAsset from "@/assets/sky360.png.asset.json";

export type Peer = {
  id: string;
  name: string;
  x: number;
  z: number;
  avatar?: string | null | undefined;
  message?: string | null | undefined;
};

export type MoveState = { x: number; z: number; angle: number };
export type LookState = { yaw: number; pitch: number };

const WORLD = 140;
const SPEED = 8;

/** Rolling terrain shared by camera, avatars and grass blades. */
export function terrainHeight(x: number, z: number) {
  return (
    Math.sin(x * 0.045) * 1.9 +
    Math.cos(z * 0.038) * 2.2 +
    Math.sin((x + z) * 0.021) * 3.1 +
    Math.sin(x * 0.11 + z * 0.07) * 0.5
  );
}

/** Single blade sprite drawn to canvas, used by the instanced grass tufts. */
function useBladeTexture() {
  return useMemo(() => {
    const w = 64;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const baseX = 10 + i * 14;
      const tipX = baseX + (Math.random() - 0.5) * 18;
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "#2f6b23");
      grad.addColorStop(1, "#8bd15a");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(baseX - 4, h);
      ctx.quadraticCurveTo(baseX + 2, h * 0.45, tipX, 6);
      ctx.quadraticCurveTo(baseX + 8, h * 0.5, baseX + 5, h);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Sky() {
  const tex = useTexture(skyAsset.url);
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.wrapS = THREE.RepeatWrapping;
  }, [tex]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[520, 64, 40]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Ground() {
  const tex = useTexture(grassAsset.url);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WORLD * 2.6, WORLD * 2.6, 180, 180);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useLayoutEffect(() => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(70, 70);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  }, [tex]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}

/** Instanced 3D grass tufts that follow the terrain. */
function GrassTufts({ count = 5000 }: { count?: number }) {
  const blade = useBladeTexture();
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 190;
      const z = (Math.random() - 0.5) * 190;
      const scale = 0.7 + Math.random() * 0.9;
      p.set(x, terrainHeight(x, z) + 0.5 * scale, z);
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }, [count]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1.1, 1.1]} />
      <meshStandardMaterial
        map={blade}
        transparent
        alphaTest={0.4}
        side={THREE.DoubleSide}
        roughness={0.9}
      />
    </instancedMesh>
  );
}

function Scenery() {
  const props = useMemo(
    () =>
      Array.from({ length: 54 }, () => {
        const x = (Math.random() - 0.5) * WORLD * 1.8;
        const z = (Math.random() - 0.5) * WORLD * 1.8;
        return { x, z, y: terrainHeight(x, z), s: 0.8 + Math.random() * 1.4, tree: Math.random() > 0.35 };
      }),
    [],
  );
  return (
    <group>
      {props.map((p, i) =>
        p.tree ? (
          <group key={i} position={[p.x, p.y, p.z]} scale={p.s}>
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
          <mesh key={i} position={[p.x, p.y + 0.35 * p.s, p.z]} scale={p.s} castShadow>
            <dodecahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.95} />
          </mesh>
        ),
      )}
    </group>
  );
}

/** Profile photo shown as a billboarded disc so it always faces the camera. */
function PhotoBadge({ url, fallback }: { url?: string | null | undefined; fallback: string }) {
  const texture = useMemo(() => {
    if (!url) return null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [url]);

  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[0.98, 40]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {texture ? (
        <mesh>
          <circleGeometry args={[0.88, 40]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : (
        <>
          <mesh>
            <circleGeometry args={[0.88, 40]} />
            <meshBasicMaterial color="#4fb0ef" toneMapped={false} />
          </mesh>
          <Text fontSize={0.9} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>
            {fallback}
          </Text>
        </>
      )}
    </group>
  );
}

/** Neon speech balloon, always readable and never rotating with the avatar. */
function Balloon({ text }: { text: string }) {
  const width = Math.min(7, Math.max(2.4, text.length * 0.3));
  return (
    <group position={[0, 1.9, 0]}>
      <mesh>
        <planeGeometry args={[width, 1.1]} />
        <meshBasicMaterial color="#04122b" transparent opacity={0.72} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[width + 0.14, 1.24]} />
        <meshBasicMaterial color="#38f0ff" toneMapped={false} />
      </mesh>
      <Text
        position={[0, 0, 0.02]}
        fontSize={0.36}
        maxWidth={width - 0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.045}
        outlineColor="#0ea5e9"
      >
        {text}
      </Text>
    </group>
  );
}

function AvatarTag({
  name,
  avatar,
  message,
}: {
  name: string;
  avatar?: string | null | undefined;
  message?: string | null | undefined;
}) {
  return (
    <Billboard position={[0, 1.7, 0]}>
      <PhotoBadge url={avatar} fallback={(name || "?").charAt(0).toUpperCase()} />
      <Text position={[0, -1.28, 0]} fontSize={0.36} color="#062a44" outlineWidth={0.04} outlineColor="#ffffff">
        {name}
      </Text>
      {message ? <Balloon text={message} /> : null}
    </Billboard>
  );
}

function Body({ tint }: { tint: string }) {
  return (
    <group>
      <mesh castShadow>
        <capsuleGeometry args={[0.42, 0.7, 8, 16]} />
        <meshStandardMaterial color={tint} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Player({
  moveRef,
  inputRef,
  lookRef,
  firstPerson,
  name,
  avatar,
  message,
  onMove,
}: {
  moveRef: React.MutableRefObject<MoveState>;
  inputRef: React.MutableRefObject<{ x: number; z: number }>;
  lookRef: React.MutableRefObject<LookState>;
  firstPerson: boolean;
  name: string;
  avatar?: string | null | undefined;
  message?: string | null | undefined;
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
    const { yaw, pitch } = lookRef.current;

    if (len > 0.05) {
      ix /= len;
      iz /= len;
      // Camera-relative movement: forward follows where the player is looking.
      const moveX = -Math.sin(yaw) * -iz + Math.cos(yaw) * ix;
      const moveZ = -Math.cos(yaw) * -iz - Math.sin(yaw) * ix;
      state.x = THREE.MathUtils.clamp(state.x + moveX * SPEED * dt, -WORLD, WORLD);
      state.z = THREE.MathUtils.clamp(state.z + moveZ * SPEED * dt, -WORLD, WORLD);
      state.angle = Math.atan2(moveX, moveZ);
    }

    const groundY = terrainHeight(state.x, state.z);
    const g = body.current;
    if (g) {
      g.position.set(state.x, groundY + 0.95, state.z);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.angle, 1 - Math.exp(-10 * dt));
      g.visible = !firstPerson;
    }

    if (firstPerson) {
      camera.position.set(state.x, groundY + 1.7, state.z);
      camera.lookAt(
        state.x - Math.sin(yaw) * 6,
        groundY + 1.7 + Math.tan(pitch) * 6,
        state.z - Math.cos(yaw) * 6,
      );
    } else {
      const dist = 9;
      const target = new THREE.Vector3(
        state.x + Math.sin(yaw) * dist,
        groundY + 4.4 - Math.tan(pitch) * 5,
        state.z + Math.cos(yaw) * dist,
      );
      camera.position.lerp(target, 1 - Math.exp(-7 * dt));
      camera.lookAt(state.x, groundY + 1.6, state.z);
    }

    const now = performance.now();
    if (now - lastSent.current > 120) {
      lastSent.current = now;
      onMove({ ...state });
    }
  });

  return (
    <group ref={body}>
      <Body tint="#4fb0ef" />
      <AvatarTag name={name} avatar={avatar} message={message} />
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
    node.position.y = terrainHeight(node.position.x, node.position.z) + 0.95;
  });
  return (
    <group ref={g} position={[peer.x, terrainHeight(peer.x, peer.z) + 0.95, peer.z]}>
      <Body tint="#8fe4a2" />
      <AvatarTag name={peer.name} avatar={peer.avatar} message={peer.message} />
    </group>
  );
}

export function UniverseScene({
  moveRef,
  inputRef,
  lookRef,
  firstPerson,
  name,
  avatar,
  myMessage,
  peers,
  onMove,
}: {
  moveRef: React.MutableRefObject<MoveState>;
  inputRef: React.MutableRefObject<{ x: number; z: number }>;
  lookRef: React.MutableRefObject<LookState>;
  firstPerson: boolean;
  name: string;
  avatar?: string | null | undefined;
  myMessage?: string | null | undefined;
  peers: Peer[];
  onMove: (state: MoveState) => void;
}) {
  return (
    <Canvas shadows camera={{ position: [0, 6, 12], fov: 62, far: 1200 }} dpr={[1, 2]}>
      <fog attach="fog" args={["#bcdcf5", 90, 320]} />
      <hemisphereLight args={["#dff0ff", "#4f7d3c", 0.85]} />
      <directionalLight
        position={[40, 60, 25]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Suspense fallback={null}>
        <Sky />
        <Ground />
        <GrassTufts />
        <Scenery />
        <Player
          moveRef={moveRef}
          inputRef={inputRef}
          lookRef={lookRef}
          firstPerson={firstPerson}
          name={name}
          avatar={avatar}
          message={myMessage}
          onMove={onMove}
        />
        {peers.map((p) => (
          <PeerAvatar key={p.id} peer={p} />
        ))}
      </Suspense>
    </Canvas>
  );
}
