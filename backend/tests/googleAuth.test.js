require('dotenv').config();
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const { findOrCreateGoogleUser } = require('../src/config/passport');
const User = require('../src/models/User');

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
  delete process.env.SUPERADMIN_EMAIL;
});

afterAll(async () => {
  await stopTestDb();
});

function mockProfile(overrides = {}) {
  return {
    id: 'google-123',
    displayName: 'Google Person',
    emails: [{ value: 'googleperson@example.com' }],
    photos: [{ value: 'http://example.com/avatar.png' }],
    ...overrides,
  };
}

describe('findOrCreateGoogleUser (invite-only)', () => {
  it('turns away people who were not invited', async () => {
    await expect(findOrCreateGoogleUser(mockProfile())).rejects.toMatchObject({ code: 'NOT_INVITED' });
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates the Super Admin from SUPERADMIN_EMAIL', async () => {
    process.env.SUPERADMIN_EMAIL = 'googleperson@example.com';
    const user = await findOrCreateGoogleUser(mockProfile());
    expect(user.role).toBe('admin');
    expect(user.googleId).toBe('google-123');
  });

  it('links Google to an invited account with the same email and activates it on sign-in', async () => {
    const invited = await User.create({ name: 'Invited', email: 'linked@example.com', status: 'invited' });
    const linked = await findOrCreateGoogleUser(mockProfile({ id: 'google-999', emails: [{ value: 'Linked@Example.com' }] }));
    expect(linked._id.toString()).toBe(invited._id.toString());
    expect(linked.googleId).toBe('google-999');
    expect(linked.name).toBe('Google Person');
  });

  it('returns the existing user when googleId already matches', async () => {
    await User.create({ name: 'Existing', email: 'googleperson@example.com' });
    const first = await findOrCreateGoogleUser(mockProfile());
    const second = await findOrCreateGoogleUser(mockProfile());
    expect(second._id.toString()).toBe(first._id.toString());
    expect(await User.countDocuments()).toBe(1);
  });

  it('refuses disabled accounts', async () => {
    await User.create({ name: 'Off', email: 'googleperson@example.com', status: 'disabled' });
    await expect(findOrCreateGoogleUser(mockProfile())).rejects.toMatchObject({ code: 'DISABLED' });
  });
});
