import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	calculateStandings,
	createEvent,
	generateNextRound,
	resizeEventStructure,
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
		expect(event.teams[0].players[0].name).toBe('Player A');
		expect(event.teams[0].players[1].name).toBe('Player B');
		expect(event.rounds).toEqual([]);
	});

	it('generates player pairings without teammate pairings', () => {
		let event = createEvent({ name: 'League', teamCount: 4, playersPerTeam: 2 });
		event = generateNextRound(event);
		event = generateNextRound(event);

		for (const round of event.rounds) {
			for (const match of round.matches) {
				expect(match.teamAId).not.toBe(match.teamBId);
				expect(match.playerMatches).toHaveLength(1);
			}
		}
	});

	it('prioritizes new opponent teams per player across rounds', () => {
		let event = createEvent({ name: 'League', teamCount: 6, playersPerTeam: 2 });
		event = generateNextRound(event);
		event = generateNextRound(event);
		event = generateNextRound(event);

		const seenByPlayer = new Map();
		for (const team of event.teams) {
			for (const player of team.players) {
				seenByPlayer.set(player.id, new Set());
			}
		}

		for (const round of event.rounds) {
			for (const match of round.matches) {
				const pm = match.playerMatches[0];
				seenByPlayer.get(pm.teamAPlayerId).add(match.teamBId);
				seenByPlayer.get(pm.teamBPlayerId).add(match.teamAId);
			}
		}

		for (const seenTeams of seenByPlayer.values()) {
			expect(seenTeams.size).toBeGreaterThanOrEqual(3);
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
		expect(standings[0].matchPoints).toBe(6);
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

	it('resizes event structure and clears existing rounds', () => {
		let event = createEvent({ name: 'Resize Me', teamCount: 4, playersPerTeam: 2 });
		event = generateNextRound(event);

		const originalTeamId = event.teams[0].id;
		const originalPlayerId = event.teams[0].players[0].id;
		const resized = resizeEventStructure(event, { teamCount: 6, playersPerTeam: 3 });

		expect(resized.teams).toHaveLength(6);
		expect(resized.playersPerTeam).toBe(3);
		expect(resized.rounds).toEqual([]);
		expect(resized.teams[0].id).toBe(originalTeamId);
		expect(resized.teams[0].players[0].id).toBe(originalPlayerId);
	});

	it('shrinks teams and players when resizing down', () => {
		const event = createEvent({ name: 'Resize Down', teamCount: 6, playersPerTeam: 4 });
		const resized = resizeEventStructure(event, { teamCount: 3, playersPerTeam: 2 });

		expect(resized.teams).toHaveLength(3);
		for (const team of resized.teams) {
			expect(team.players).toHaveLength(2);
		}
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
