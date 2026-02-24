/**
 * Integration-style unit tests for the playerDisplay module.
 */
import { describe, expect, it } from 'vitest';
import {
	formatPlayerDisplayName,
	getAlphabetLabel,
	getDefaultPlayerName,
	getTeamInitials,
} from '../src/lib/playerDisplay.js';

/**
 * Verifies player display helper formatting behavior and fallback naming.
 */
describe('player display formatting', () => {
	it('builds team initials from team name', () => {
		expect(getTeamInitials('Team Swiss Event Tracker')).toBe('TSET');
		expect(getTeamInitials('alpha squad')).toBe('AS');
		expect(getTeamInitials('')).toBe('T');
	});

	it('builds default player names using alphabet labels', () => {
		expect(getAlphabetLabel(0)).toBe('A');
		expect(getAlphabetLabel(1)).toBe('B');
		expect(getAlphabetLabel(25)).toBe('Z');
		expect(getAlphabetLabel(26)).toBe('AA');
		expect(getDefaultPlayerName(2)).toBe('Player C');
	});

	it('formats player display with initials + team player number prefix', () => {
		const team = {
			id: 'team-1',
			name: 'Red Raptors',
			players: [
				{ id: 'p1', name: 'Player A' },
				{ id: 'p2', name: 'Nina' },
			],
		};
		expect(formatPlayerDisplayName(team, team.players[0])).toBe('RR-1 Player A');
		expect(formatPlayerDisplayName(team, team.players[1])).toBe('RR-2 Nina');
	});
});
