// In-memory per-user state. The default factory receives the userId and any
// extra args passed to get(); the returned object is the lazy initial state.

export function createUserStateStore(initialFactory) {
  const states = new Map();

  function get(userId, ...args) {
    if (!states.has(userId)) {
      states.set(userId, initialFactory(userId, ...args));
    }
    return states.get(userId);
  }

  function patch(userId, partial) {
    states.set(userId, { ...get(userId), ...partial });
  }

  return { get, patch };
}
