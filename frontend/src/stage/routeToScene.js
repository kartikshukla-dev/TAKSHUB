// Which 3D scene plays behind which page. Pure, so it is unit tested.
//   scene: 'ribbon'  -> Oncare ribbon + particles (login, dashboard)
//          'planets' -> page shows its own interactive planets view; the
//                       background keeps a calm particle sphere
//          'particles' -> particle field morphed into `shape`
// shape: galaxy | ring | grid | wave | bars | sphere | helix

const EXACT = {
  '/login': { scene: 'ribbon', shape: 'helix' },
  '/oauth/callback': { scene: 'ribbon', shape: 'helix' },
  '/dashboard': { scene: 'ribbon', shape: 'galaxy' },
  '/projects': { scene: 'planets', shape: 'sphere' },
  '/team-leads': { scene: 'planets', shape: 'sphere' },
  '/calendar': { scene: 'particles', shape: 'ring' },
  '/team': { scene: 'particles', shape: 'grid' },
  '/users': { scene: 'particles', shape: 'grid' },
  '/chat': { scene: 'particles', shape: 'wave' },
  '/reports': { scene: 'particles', shape: 'bars' },
  '/activity': { scene: 'particles', shape: 'bars' },
  '/settings': { scene: 'particles', shape: 'sphere' },
  '/todos': { scene: 'particles', shape: 'sphere' },
};

export const SHAPES = ['galaxy', 'ring', 'grid', 'wave', 'bars', 'sphere', 'helix'];

export default function routeToScene(pathname = '/') {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (EXACT[path]) return EXACT[path];
  if (path === '/') return { scene: 'ribbon', shape: 'galaxy' };
  // Detail pages (/projects/:id, /teams/:id, /team/:id) and task lists.
  return { scene: 'particles', shape: 'galaxy' };
}
