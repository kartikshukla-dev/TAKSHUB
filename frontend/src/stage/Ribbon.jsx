import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pointer } from './pointer';

// Oncare awareness ribbon drawn in code: a loop crossing over itself with
// two tails, swept as a flattened tube and shaded like iridescent glass.
const POINTS = [
  [-0.95, -1.75, 0.12],
  [-0.62, -1.05, 0.14],
  [-0.2, -0.25, 0.1],
  [0.28, 0.55, 0.02],
  [0.56, 1.12, -0.06],
  [0.42, 1.58, -0.12],
  [0, 1.78, -0.15],
  [-0.42, 1.58, -0.12],
  [-0.56, 1.12, -0.06],
  [-0.28, 0.55, -0.02],
  [0.2, -0.25, -0.1],
  [0.62, -1.05, -0.14],
  [0.95, -1.75, -0.12],
];

export function ribbonCurve() {
  return new THREE.CatmullRomCurve3(POINTS.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
}

export default function Ribbon({ visible, variant = 'login', transmission = true }) {
  const group = useRef();
  const inner = useRef();
  const { viewport } = useThree();
  const geometry = useMemo(() => {
    const g = new THREE.TubeGeometry(ribbonCurve(), 260, 0.17, 48, false);
    g.scale(1, 1, 0.42);
    return g;
  }, []);

  const wide = viewport.width > 9;
  // Dashboard: small, high and right, beside the "Welcome back" header
  // (pushed back in depth) so it never sits on top of the stat cards.
  const target = variant === 'dashboard'
    ? { x: wide ? viewport.width * 0.22 : viewport.width * 0.25, y: viewport.height * 0.36, z: -2.5, s: wide ? 0.62 : 0.45 }
    : { x: wide ? viewport.width * 0.27 : 0, y: wide ? 0 : viewport.height * 0.26, z: 0, s: wide ? 1.5 : 0.8 };

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const goal = visible ? target.s : 0.001;
    const s = g.scale.x + (goal - g.scale.x) * Math.min(1, delta * 2.6);
    g.scale.setScalar(s);
    g.position.x += (target.x - g.position.x) * Math.min(1, delta * 2.2);
    g.position.z += (target.z - g.position.z) * Math.min(1, delta * 2.2);
    g.position.y += (target.y + Math.sin(t * 0.8) * 0.12 - g.position.y) * Math.min(1, delta * 2.2);
    if (inner.current) {
      inner.current.rotation.y = Math.sin(t * 0.35) * 0.55 + pointer.x * 0.5;
      inner.current.rotation.x = -pointer.y * 0.3 + Math.sin(t * 0.5) * 0.06;
      inner.current.rotation.z = Math.sin(t * 0.3) * 0.08;
    }
    g.visible = s > 0.01;
  });

  return (
    <group ref={group} scale={0.001}>
      <group ref={inner}>
        <mesh geometry={geometry}>
          {transmission ? (
            <meshPhysicalMaterial
              color="#b48cff"
              emissive="#4a1aa8"
              emissiveIntensity={0.45}
              roughness={0.12}
              metalness={0.05}
              transmission={0.82}
              thickness={0.7}
              ior={1.45}
              iridescence={1}
              iridescenceIOR={1.35}
              iridescenceThicknessRange={[120, 620]}
              clearcoat={1}
              clearcoatRoughness={0.08}
            />
          ) : (
            <meshStandardMaterial color="#a77bff" emissive="#5a22c8" emissiveIntensity={0.6} roughness={0.25} metalness={0.2} />
          )}
        </mesh>
      </group>
      <pointLight position={[0, 0.6, 1.4]} intensity={6} distance={6} color="#cc66ff" />
    </group>
  );
}
