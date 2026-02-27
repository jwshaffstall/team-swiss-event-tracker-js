const STORAGE_KEY = 'teamSwissEvents.v1';

/**
 * Loads persisted application state from localStorage.
 *
 * @returns {{events: Array<object>, activeEventId: string|null}} Parsed state, or a safe empty state on invalid/missing data.
 */
export function loadState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return { events: [], activeEventId: null };
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed.events)) {
			return { events: [], activeEventId: null };
		}
		return {
			events: parsed.events,
			activeEventId: parsed.activeEventId ?? parsed.events[0]?.id ?? null,
		};
	} catch {
		return { events: [], activeEventId: null };
	}
}

/**
 * Saves the full application state snapshot to localStorage.
 *
 * @param {{events: Array<object>, activeEventId: string|null}} state Serializable state object.
 */
export function saveState(state) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Applies a mutation callback to persisted state and writes the result back.
 *
 * @template T
 * @param {(state: {events: Array<object>, activeEventId: string|null}) => T} updateFn Callback that receives previous state.
 * @returns {T} The value returned by `updateFn` after being persisted.
 */
export function withSavedState(updateFn) {
	const previous = loadState();
	const next = updateFn(previous);
	saveState(next);
	return next;
}

/**
 * Exposes the internal storage namespace key for tests and diagnostics.
 *
 * @returns {string} Local storage key used for all persisted event data.
 */
export function getStorageKey() {
	return STORAGE_KEY;
}
