import { describe, expect, it } from 'vitest';
import { createEvent } from '../src/lib/swiss.js';
import {
	assignPlayersToDraftTables,
	buildBalancedTableSizes,
	listSuggestedDraftLayouts,
} from '../src/lib/draftTables.js';

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
});
