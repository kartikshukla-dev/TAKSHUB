import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeShape } from './shapes';
import { pointer, onBurst } from './pointer';

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec4 uBurst;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aRand;
  varying float vRand;
  varying float vDepth;

  void main() {
    // Each particle starts its trip a little later than the previous one.
    float p = clamp((uProgress - aRand * 0.35) / 0.65, 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);
    vec3 pos = mix(aStart, aEnd, p);

    // Swirl mid-flight, then a gentle idle "breathing".
    float mid = sin(p * 3.14159);
    pos += vec3(sin(aRand * 40.0 + uTime), cos(aRand * 31.0 + uTime * 0.8), sin(aRand * 17.0 - uTime)) * mid * 0.9;
    pos += vec3(sin(uTime * 0.6 + aRand * 20.0), cos(uTime * 0.5 + aRand * 13.0), sin(uTime * 0.4 + aRand * 7.0)) * 0.05;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Screen-space shockwave from UI bursts (task completed).
    vec2 ndc = gl_Position.xy / gl_Position.w;
    vec2 d = ndc - uBurst.xy;
    float f = uBurst.w * exp(-dot(d, d) * 6.0);
    gl_Position.xy += normalize(d + 1e-4) * f * 0.35 * gl_Position.w;

    gl_PointSize = uSize * uPixelRatio * (0.55 + aRand * 0.95) * (1.0 / -mv.z) * (1.0 + f * 2.0);
    vRand = aRand;
    vDepth = -mv.z;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uAlpha;
  varying float vRand;
  varying float vDepth;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = vRand < 0.5 ? mix(uColorA, uColorB, vRand * 2.0) : mix(uColorB, uColorC, (vRand - 0.5) * 2.0);
    col += vec3(1.0) * smoothstep(0.12, 0.0, d) * 0.55;
    float fade = clamp(1.0 - (vDepth - 7.0) / 14.0, 0.2, 1.0);
    gl_FragColor = vec4(col, a * fade * uAlpha);
  }
`;

const MORPH_SECONDS = 1.9;

// `dim` lowers brightness on content-heavy pages so text stays readable.
export default function ParticleMorph({ count, shape, offset = [0, 0, 0], dpr = 1, dim = false }) {
  const ref = useRef();
  const group = useRef();
  const state = useRef({ progress: 1, shape });

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const end = makeShape(shape, count);
    const start = makeShape('sphere', count, 3);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i += 1) rand[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 26 },
        uAlpha: { value: 0.5 },
        uPixelRatio: { value: dpr },
        uBurst: { value: new THREE.Vector4(0, 0, 0, 0) },
        uColorA: { value: new THREE.Color('#7c4dff') },
        uColorB: { value: new THREE.Color('#cc66ff') },
        uColorC: { value: new THREE.Color('#7fd6ff') },
      },
    });
    state.current = { progress: 0, shape };
    return { geometry: g, material: m };
    // Rebuilt only when the particle budget changes; shape changes morph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  // Shape change: freeze the current blend as the new start, morph to the new end.
  useEffect(() => {
    if (state.current.shape === shape) return;
    const startAttr = geometry.getAttribute('aStart');
    const endAttr = geometry.getAttribute('aEnd');
    const randAttr = geometry.getAttribute('aRand');
    const pr = state.current.progress;
    for (let i = 0; i < count; i += 1) {
      let p = Math.min(1, Math.max(0, (pr - randAttr.array[i] * 0.35) / 0.65));
      p = p * p * (3 - 2 * p);
      for (let k = 0; k < 3; k += 1) {
        const j = i * 3 + k;
        startAttr.array[j] += (endAttr.array[j] - startAttr.array[j]) * p;
      }
    }
    endAttr.array.set(makeShape(shape, count));
    startAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
    state.current = { progress: 0, shape };
  }, [shape, count, geometry]);

  useEffect(
    () =>
      onBurst(({ x, y }) => {
        const b = material.uniforms.uBurst.value;
        b.set(x, y, 0, 1);
      }),
    [material]
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const u = material.uniforms;
    u.uTime.value += dt;
    state.current.progress = Math.min(1, state.current.progress + dt / MORPH_SECONDS);
    u.uProgress.value = state.current.progress;
    u.uBurst.value.w *= 0.93;
    u.uAlpha.value += ((dim ? 0.32 : 0.6) - u.uAlpha.value) * Math.min(1, dt * 2);
    if (group.current) {
      group.current.rotation.y += dt * 0.05;
      group.current.rotation.x += (pointer.y * 0.25 - group.current.rotation.x) * 0.04;
      group.current.position.x += (offset[0] + pointer.x * 0.4 - group.current.position.x) * 0.04;
      group.current.position.y += (offset[1] - group.current.position.y) * 0.04;
    }
  });

  return (
    <group ref={group} position={offset}>
      <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
