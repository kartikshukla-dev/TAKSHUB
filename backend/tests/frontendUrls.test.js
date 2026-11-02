const { frontendUrls, primaryFrontendUrl, corsOrigin } = require('../src/utils/frontendUrls');

const allow = (origin) => new Promise((resolve) => corsOrigin()(origin, (e, ok) => resolve(ok)));

describe('FRONTEND_URL parsing', () => {
  const saved = process.env.FRONTEND_URL;
  afterEach(() => {
    process.env.FRONTEND_URL = saved;
  });

  it('accepts several comma separated origins and ignores trailing slashes', async () => {
    process.env.FRONTEND_URL = 'https://takshub.vercel.app/ , http://localhost:5173';
    expect(frontendUrls()).toEqual(['https://takshub.vercel.app', 'http://localhost:5173']);
    expect(primaryFrontendUrl()).toBe('https://takshub.vercel.app');
    expect(await allow('https://takshub.vercel.app')).toBe(true);
    expect(await allow('http://localhost:5173')).toBe(true);
    expect(await allow('https://evil.example')).toBe(false);
  });

  it('falls back to localhost and allows any origin when unset', () => {
    delete process.env.FRONTEND_URL;
    expect(primaryFrontendUrl()).toBe('http://localhost:5173');
    expect(corsOrigin()).toBe('*');
  });
});
