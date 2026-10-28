require('dotenv').config();
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const { findOrCreateGoogleUser } = require('../src/config/passport');
const User = require('../src/models/User');

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
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

describe('findOrCreateGoogleUser', () => {
  it('creates a new user when no match exists', async () => {
    const user = await findOrCreateGoogleUser(mockProfile());
    expect(user.googleId).toBe('google-123');
    expect(user.email).toBe('googleperson@example.com');
    expect(user.role).toBe('member');
  });

  it('returns the existing user when googleId already matches', async () => {
    const first = await findOrCreateGoogleUser(mockProfile());
    const second = await findOrCreateGoogleUser(mockProfile());
    expect(second._id.toString()).toBe(first._id.toString());

    const count = await User.countDocuments();
    expect(count).toBe(1);
  });

  it('links googleId to an existing email/password account', async () => {
    const existing = await User.create({
      name: 'Existing Account',
      email: 'linked@example.com',
      passwordHash: 'somepassword',
    });

    const linked = await findOrCreateGoogleUser(
      mockProfile({ id: 'google-999', emails: [{ value: 'linked@example.com' }] })
    );

    expect(linked._id.toString()).toBe(existing._id.toString());
    expect(linked.googleId).toBe('google-999');
  });
});
