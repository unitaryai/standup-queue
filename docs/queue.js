// Pure queue logic. Every function takes a state and returns a new state,
// never mutating its input, so the whole state can be broadcast as one
// snapshot (the Co-Doing API only guarantees eventual consistency of the
// latest complete state, not delivery of individual messages).

export const MAX_ENTRIES = 100;
export const MAX_NAME_LENGTH = 40;

/**
 * @typedef {{ id: string, name: string }} Entry
 * @typedef {{ rev: number, speaking: Entry | null, waiting: Entry[], done: Entry[] }} QueueState
 */

/** @returns {QueueState} */
export function emptyState() {
  return { rev: 0, speaking: null, waiting: [], done: [] };
}

export function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function bump(state, changes) {
  return { ...state, ...changes, rev: state.rev + 1 };
}

function without(list, id) {
  return list.filter((entry) => entry.id !== id);
}

export function isQueued(state, id) {
  return state.speaking?.id === id || state.waiting.some((e) => e.id === id);
}

/** Adds a person to the back of the queue. Rejoining after speaking is allowed. */
export function join(state, entry) {
  const name = cleanName(entry.name);
  if (!name || isQueued(state, entry.id)) return state;
  if (state.waiting.length + state.done.length >= MAX_ENTRIES) return state;
  return bump(state, {
    waiting: [...state.waiting, { id: entry.id, name }],
    done: without(state.done, entry.id),
  });
}

export function remove(state, id) {
  return bump(state, {
    speaking: state.speaking?.id === id ? null : state.speaking,
    waiting: without(state.waiting, id),
    done: without(state.done, id),
  });
}

/** Randomises the order of everyone still waiting. `random` is injectable for tests. */
export function shuffle(state, random = Math.random) {
  const waiting = [...state.waiting];
  for (let i = waiting.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [waiting[i], waiting[j]] = [waiting[j], waiting[i]];
  }
  return bump(state, { waiting });
}

/** Marks the current speaker as done and brings up the next person. */
export function next(state) {
  const [upNext = null, ...rest] = state.waiting;
  if (!state.speaking && !upNext) return state;
  return bump(state, {
    speaking: upNext,
    waiting: rest,
    done: state.speaking ? [...state.done, state.speaking] : state.done,
  });
}

/** Sends the current speaker to the back of the queue (e.g. not ready yet). */
export function skip(state) {
  if (!state.speaking) return state;
  const [upNext = null, ...rest] = state.waiting;
  return bump(state, { speaking: upNext, waiting: [...rest, state.speaking] });
}

export function move(state, id, offset) {
  const from = state.waiting.findIndex((e) => e.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= state.waiting.length) return state;
  const waiting = [...state.waiting];
  [waiting[from], waiting[to]] = [waiting[to], waiting[from]];
  return bump(state, { waiting });
}

export function reset(state) {
  return { ...emptyState(), rev: state.rev + 1 };
}

/**
 * Validates a state received from another participant. Anything malformed is
 * rejected, and names are cleaned, because other clients are untrusted input.
 * @returns {QueueState | null}
 */
export function parseState(raw) {
  if (!raw || typeof raw !== "object" || !Number.isInteger(raw.rev)) return null;
  const entry = (e) =>
    e && typeof e.id === "string" && e.id.length <= 64 && cleanName(e.name)
      ? { id: e.id, name: cleanName(e.name) }
      : null;
  const list = (l) =>
    Array.isArray(l) ? l.slice(0, MAX_ENTRIES).map(entry).filter(Boolean) : null;
  const waiting = list(raw.waiting);
  const done = list(raw.done);
  if (!waiting || !done) return null;
  const speaking = raw.speaking == null ? null : entry(raw.speaking);
  return { rev: raw.rev, speaking, waiting, done };
}
