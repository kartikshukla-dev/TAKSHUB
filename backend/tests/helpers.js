// Creates a user directly and returns a signed token, replacing the old
// password sign-up that tests used to call.
const User = require('../src/models/User');
const { signToken } = require('../src/utils/jwt');

async function createUser(overrides = {}) {
  const user = await User.create({
    name: 'User',
    email: `user${Date.now()}${Math.random()}@example.com`.replace('0.', ''),
    role: 'member',
    status: 'active',
    ...overrides,
  });
  return { token: signToken(user), user: user.toSafeJSON(), doc: user };
}

module.exports = { createUser };
