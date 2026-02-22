const STORAGE_KEY = 'teamSwissEvents.v1';

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

export function saveState(state) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function withSavedState(updateFn) {
	const previous = loadState();
	const next = updateFn(previous);
	saveState(next);
	return next;
}

export function getStorageKey() {
	return STORAGE_KEY;
}
