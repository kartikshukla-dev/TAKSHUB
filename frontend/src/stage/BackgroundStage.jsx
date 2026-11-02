import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import ParticleMorph from './ParticleMorph';
import Ribbon from './Ribbon';
import { QUALITY, stepDown } from './quality';
import { bindPointer } from './pointer';
import useIntro, { introPlacement } from './useIntro';

const readViewport = () =>
  typeof window === 'undefined'
    ? { width: 1440, height: 900 }
    : { width: window.innerWidth, height: window.innerHeight };

// The one persistent WebGL canvas behind the whole app. Loaded lazily (it
// pulls in three.js), never receives pointer events, pauses when the tab
// is hidden, and steps quality down when the frame rate drops.
export default function BackgroundStage({ quality, scene, shape, pathname, codedRibbon }) {
  const [level, setLevel] = useState(quality);
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);

  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => setLevel(quality), [quality]);
  useEffect(() => {
    bindPointer();
    const onVis = () => setHidden(document.hidden);
    const onResize = () => setViewport(readViewport());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // The login page plays the particle intro; its ribbon is made of particles.
  const intro = useIntro(pathname === '/login');

  const q = QUALITY[level] || QUALITY.low;
  const dpr = Math.min(q.dpr, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const ribbonOn = scene === 'ribbon' && codedRibbon && !intro;
  const variant = pathname.startsWith('/dashboard') || pathname === '/' ? 'dashboard' : 'login';
  // Push the particle field aside while the ribbon is centre stage.
  // Content pages keep the field further back so it reads as atmosphere.
  const baseOffset = scene === 'ribbon' ? [variant === 'login' ? -1.2 : 0, 0, -2] : [0, 0, -3];
  const place = intro ? introPlacement(intro.shape, viewport) : null;
  const offset = place ? place.offset : baseOffset;
  const fieldShape = intro ? intro.shape : shape;
  const spin = !intro || !['ball', 'burst', 'ribbon'].includes(intro.shape);

  return (
    <Canvas
      className="stage-canvas"
      dpr={dpr}
      frameloop={hidden ? 'never' : 'always'}
      gl={{ antialias: level !== 'low', alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 10], fov: 50, near: 0.1, far: 60 }}
      aria-hidden="true"
    >
      <PerformanceMonitor onDecline={() => setLevel((l) => stepDown(l))} flipflops={2} />
      <ambientLight intensity={0.35} />
      <pointLight position={[6, 4, 6]} intensity={40} color="#9966ff" />
      <pointLight position={[-6, -3, 4]} intensity={25} color="#ff7ad9" />
      {codedRibbon && (
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={3} color="#cc66ff" position={[0, 3, 4]} scale={[8, 2, 1]} />
          <Lightformer intensity={2} color="#7fd6ff" position={[-5, -1, 2]} scale={[2, 6, 1]} />
          <Lightformer intensity={2.5} color="#9966ff" position={[5, 0, -3]} scale={[3, 6, 1]} />
        </Environment>
      )}
      <ParticleMorph
        count={q.particles}
        shape={fieldShape}
        offset={offset}
        dpr={dpr}
        dim={!pathname.startsWith('/login')}
        morphSeconds={intro ? intro.morph : undefined}
        spin={spin}
        layout={place ? place.layout : 'center'}
        split={place ? place.split : 0}
        scale={place ? place.scale : 1}
      />
      {codedRibbon && <Ribbon visible={ribbonOn} variant={variant} transmission={q.transmission} />}
      {q.bloom && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.18} luminanceSmoothing={0.3} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
