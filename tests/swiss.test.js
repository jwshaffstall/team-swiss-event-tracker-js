import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	calculateStandings,
	createEvent,
	generateNextRound,
	validatePlayerMatchScore,
} from '../src/lib/swiss.js';
import { generatePublishedHtml } from '../src/lib/publish.js';
import { getStorageKey, loadState, saveState } from '../src/lib/storage.js';

describe('swiss event engine', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
	});

	it('creates an event with configured teams and players', () => {
		const event = createEvent({ name: 'League', teamCount: 4, playersPerTeam: 3 });
		expect(event.teams).toHaveLength(4);
		expect(event.teams[0].players).toHaveLength(3);
		expect(event.rounds).toEqual([]);
	});

	it('generates pairings without teammate pairings and avoids rematches', () => {
		let event = createEvent({ name: 'League', teamCount: 4, playersPerTeam: 2 });
		event = generateNextRound(event);
		event = generateNextRound(event);

		const seen = new Set();
		for (const round of event.rounds) {
			for (const match of round.matches) {
				expect(match.teamAId).not.toBe(match.teamBId);
				const key = [match.teamAId, match.teamBId].sort().join(':');
				expect(seen.has(key)).toBe(false);
				seen.add(key);
			}
		}
	});

	it('computes standings and tie breakers from results', () => {
		let event = createEvent({ name: 'League', teamCount: 4, playersPerTeam: 2 });
		event = generateNextRound(event);
		for (const match of event.rounds[0].matches) {
			for (const pm of match.playerMatches) {
				pm.winsA = 2;
				pm.winsB = 1;
			}
		}
		const standings = calculateStandings(event);
		expect(standings[0].matchPoints).toBe(3);
		expect(standings[0].buchholz).toBeGreaterThanOrEqual(0);
	});

	it('validates player results with 0-3 total games played', () => {
		expect(validatePlayerMatchScore(2, 1)).toBe(true);
		expect(validatePlayerMatchScore(1, 1, 1)).toBe(true);
		expect(validatePlayerMatchScore(0, 0)).toBe(true);
		expect(validatePlayerMatchScore(3, 0)).toBe(false);
		expect(validatePlayerMatchScore(2, 2)).toBe(false);
		expect(validatePlayerMatchScore(2, 1, 1)).toBe(false);
	});
});

describe('storage and publish utilities', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('persists and loads state from local storage', () => {
		const event = createEvent({ name: 'Saved', teamCount: 2, playersPerTeam: 1 });
		const state = { events: [event], activeEventId: event.id };
		saveState(state);
		expect(localStorage.getItem(getStorageKey())).toBeTruthy();
		expect(loadState()).toEqual(state);
	});

	it('creates publishable html snapshot', () => {
		const event = createEvent({ name: 'Publish Me', teamCount: 2, playersPerTeam: 1 });
		const html = generatePublishedHtml(event);
		expect(html).toContain('<!doctype html>');
		expect(html).toContain('Publish Me');
		expect(html).toContain('Standings');
	});
});
