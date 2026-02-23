import { describe, expect, it } from 'vitest';
import { createEvent } from '../src/lib/swiss.js';
import {
	assignPlayersToDraftTables,
	buildBalancedTableSizes,
	listSuggestedDraftLayouts,
} from '../src/lib/draftTables.js';

function createDeterministicRng(seed = 1) {
	let stateValue = seed >>> 0;
	return () => {
		stateValue = (stateValue * 1664525 + 1013904223) >>> 0;
		return stateValue / 4294967296;
	};
}

describe('draft table layouts', () => {
	it('builds balanced table sizes for a chosen table count', () => {
		expect(buildBalancedTableSizes(30, 4)).toEqual([8, 8, 7, 7]);
		expect(buildBalancedTableSizes(30, 5)).toEqual([6, 6, 6, 6, 6]);
		expect(buildBalancedTableSizes(30, 3)).toEqual([10, 10, 10]);
	});

	it('suggests practical table-count layouts', () => {
		const layouts = listSuggestedDraftLayouts(30);
		const counts = layouts.map((layout) => layout.tableCount);
		expect(counts).toContain(3);
		expect(counts).toContain(4);
		expect(counts).toContain(5);
	});

	it('keeps teammates at separate tables when enough tables exist', () => {
		const event = createEvent({ name: 'Draft League', teamCount: 10, playersPerTeam: 3 });
		const assignment = assignPlayersToDraftTables(event, [8, 8, 7, 7]);

		const teamCountByTable = new Map();
		for (const table of assignment.tables) {
			const counts = new Map();
			for (const player of table.players) {
				counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
			}
			teamCountByTable.set(table.tableNumber, counts);
		}

		for (const counts of teamCountByTable.values()) {
			for (const teamSeatCount of counts.values()) {
				expect(teamSeatCount).toBeLessThanOrEqual(1);
			}
		}
		expect(assignment.sameTableTeammatePairs).toBe(0);
	});

	it('minimizes teammate overlap when complete separation is impossible', () => {
		const event = createEvent({ name: 'Compact Draft', teamCount: 4, playersPerTeam: 3 });
		const assignment = assignPlayersToDraftTables(event, [6, 6]);

		for (const table of assignment.tables) {
			const counts = new Map();
			for (const player of table.players) {
				counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
			}
			for (const teamSeatCount of counts.values()) {
				expect(teamSeatCount).toBeLessThanOrEqual(2);
			}
		}
		expect(assignment.sameTableTeammatePairs).toBe(4);
	});

	it('supports randomized reshuffles for draft table seating', () => {
		const event = createEvent({ name: 'Shuffle Draft', teamCount: 10, playersPerTeam: 3 });
		const tableSizes = [8, 8, 7, 7];
		const baseline = assignPlayersToDraftTables(event, tableSizes);
		const reshuffled = assignPlayersToDraftTables(event, tableSizes, {
			randomize: true,
			rng: createDeterministicRng(42),
		});

		const serialize = (assignment) =>
			assignment.tables
				.map((table) => table.players.map((player) => player.playerId).join(','))
				.join('|');
		expect(serialize(reshuffled)).not.toBe(serialize(baseline));

		for (const table of reshuffled.tables) {
			expect(table.players.length).toBe(table.capacity);
		}
	});
});
