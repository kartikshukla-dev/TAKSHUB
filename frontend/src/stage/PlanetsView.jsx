import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Sparkles } from '@react-three/drei';
import { toPlanets } from './planets';

// Interactive solar system: each project (or team) is a planet orbiting a
// glowing core; tasks (or members) are its moons. Click a planet to open it.

function Core() {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * 1.6) * 0.04);
  });
  return (
    <group>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.7, 4]} />
        <meshStandardMaterial color="#cc66ff" emissive="#9966ff" emissiveIntensity={2.4} roughness={0.3} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshBasicMaterial color="#9966ff" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <pointLight intensity={80} distance={40} color="#d9b8ff" />
    </group>
  );
}

function Moons({ count, radius }) {
  const ref = useRef();
  const moons = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ a: (i / count) * Math.PI * 2, tilt: (i % 3) * 0.35 - 0.35 })),
    [count]
  );
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.9;
  });
  return (
    <group ref={ref}>
      {moons.map((m, i) => (
        <mesh key={i} position={[Math.cos(m.a) * radius, Math.sin(m.a) * radius * m.tilt, Math.sin(m.a) * radius]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color="#e6dcff" emissive="#9966ff" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Planet({ p, hovered, onHover, onOpen }) {
  const orbit = useRef();
  const body = useRef();
  const halo = useRef();
  const r = Math.hypot(p.position[0], p.position[2]);
  const speed = r ? 0.9 / Math.sqrt(r) : 0;
  const start = Math.atan2(p.position[2], p.position[0]);

  useFrame((s, d) => {
    if (orbit.current) orbit.current.rotation.y += d * speed * 0.12;
    if (body.current) {
      body.current.rotation.y += d * 0.4;
      const goal = hovered ? 1.18 : 1;
      body.current.scale.setScalar(body.current.scale.x + (goal - body.current.scale.x) * 0.12);
    }
    if (halo.current && p.overdue) {
      halo.current.material.opacity = 0.35 + Math.sin(s.clock.elapsedTime * 4) * 0.25;
    }
  });

  return (
    <group ref={orbit} rotation={[0, -start, 0]}>
      {r > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.006, 6, 160]} />
          <meshBasicMaterial color="#9966ff" transparent opacity={0.22} />
        </mesh>
      )}
      <group position={[r, p.position[1], 0]}>
        <mesh
          ref={body}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(p.id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = '';
          }}
          onClick={(e) => {
            e.stopPropagation();
            document.body.style.cursor = '';
            onOpen(p.href);
          }}
        >
          <sphereGeometry args={[p.size, 48, 48]} />
          <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={hovered ? 0.9 : 0.45} roughness={0.35} metalness={0.25} />
        </mesh>
        {p.overdue && (
          <mesh ref={halo} rotation={[Math.PI / 2.3, 0, 0]}>
            <torusGeometry args={[p.size * 1.45, 0.025, 8, 80]} />
            <meshBasicMaterial color="#ff5d6e" transparent opacity={0.5} />
          </mesh>
        )}
        {p.moons > 0 && <Moons count={p.moons} radius={p.size * 1.9} />}
        <Html position={[0, p.size + 0.45, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
          <div className={`planet-label ${hovered ? 'planet-label-on' : ''} ${p.overdue ? 'planet-label-late' : ''}`}>
            <strong>{p.name}</strong>
            <span>{Math.round(p.progress * 100)}% done{p.overdue ? ' · overdue' : ''}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}

export default function PlanetsView({ items, onOpen }) {
  const planets = useMemo(() => toPlanets(items), [items]);
  const [hover, setHover] = useState(null);
  const far = 7 + Math.sqrt(planets.length) * 2.6;

  return (
    <div className="planets-view" data-lenis-prevent>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, far * 0.45, far], fov: 45 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.35} />
        <Core />
        <Sparkles count={160} scale={[far * 2, 6, far * 2]} size={2} speed={0.25} color="#cc99ff" />
        {planets.map((p) => (
          <Planet key={p.id} p={p} hovered={hover === p.id} onHover={setHover} onOpen={onOpen} />
        ))}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={!hover}
          autoRotateSpeed={0.35}
          minPolarAngle={Math.PI * 0.22}
          maxPolarAngle={Math.PI * 0.55}
        />
      </Canvas>
      <p className="planets-hint">Drag to look around · click a planet to open it</p>
    </div>
  );
}
