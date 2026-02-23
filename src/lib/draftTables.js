function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}

function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}

function shuffle(values, rng) {
	const shuffled = [...values];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(rng() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
	}
	return shuffled;
}

function teammatePairs(teamCount) {
	if (teamCount < 2) {
		return 0;
	}
	return (teamCount * (teamCount - 1)) / 2;
}

export function buildBalancedTableSizes(totalPlayers, tableCount) {
	if (!isPositiveInteger(totalPlayers)) {
		throw new Error('Total players must be a positive integer.');
	}
	if (!isPositiveInteger(tableCount) || tableCount > totalPlayers) {
		throw new Error('Table count must be between 1 and the total player count.');
	}

	const largeTableSize = Math.ceil(totalPlayers / tableCount);
	const smallTableSize = Math.floor(totalPlayers / tableCount);
	const largeTableCount = totalPlayers % tableCount;

	return Array.from({ length: tableCount }, (_, index) =>
		index < largeTableCount ? largeTableSize : smallTableSize
	);
}

export function listSuggestedDraftLayouts(
	totalPlayers,
	{ minTableSize = 4, maxTableSize = 10 } = {}
) {
	if (!isPositiveInteger(totalPlayers)) {
		return [];
	}

	const minTableCount = Math.max(1, Math.ceil(totalPlayers / maxTableSize));
	const maxTableCount = Math.floor(totalPlayers / minTableSize);
	if (maxTableCount < minTableCount) {
		return [{ tableCount: 1, tableSizes: [totalPlayers] }];
	}

	return Array.from(
		{ length: maxTableCount - minTableCount + 1 },
		(_, offset) => minTableCount + offset
	).map((tableCount) => ({
		tableCount,
		tableSizes: buildBalancedTableSizes(totalPlayers, tableCount),
	}));
}

function addFlowEdge(graph, from, to, capacity) {
	const forward = { to, rev: graph[to].length, capacity };
	const reverse = { to: from, rev: graph[from].length, capacity: 0 };
	graph[from].push(forward);
	graph[to].push(reverse);
	return { from, edgeIndex: graph[from].length - 1 };
}

function buildLevelGraph(graph, source, sink) {
	const levels = Array(graph.length).fill(-1);
	levels[source] = 0;
	const queue = [source];

	while (queue.length) {
		const node = queue.shift();
		for (const edge of graph[node]) {
			if (edge.capacity > 0 && levels[edge.to] < 0) {
				levels[edge.to] = levels[node] + 1;
				queue.push(edge.to);
			}
		}
	}

	return levels[sink] >= 0 ? levels : null;
}

function sendFlow(graph, node, sink, flow, levels, iterator) {
	if (node === sink) {
		return flow;
	}

	for (; iterator[node] < graph[node].length; iterator[node] += 1) {
		const edge = graph[node][iterator[node]];
		if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) {
			continue;
		}

		const pushed = sendFlow(
			graph,
			edge.to,
			sink,
			Math.min(flow, edge.capacity),
			levels,
			iterator
		);
		if (pushed > 0) {
			edge.capacity -= pushed;
			graph[edge.to][edge.rev].capacity += pushed;
			return pushed;
		}
	}

	return 0;
}

function maxFlow(graph, source, sink) {
	let totalFlow = 0;

	while (true) {
		const levels = buildLevelGraph(graph, source, sink);
		if (!levels) {
			break;
		}

		const iterator = Array(graph.length).fill(0);
		while (true) {
			const pushed = sendFlow(
				graph,
				source,
				sink,
				Number.POSITIVE_INFINITY,
				levels,
				iterator
			);
			if (!pushed) {
				break;
			}
			totalFlow += pushed;
		}
	}

	return totalFlow;
}

function assignUniqueSeatCounts(teams, tableSizes) {
	const teamCount = teams.length;
	const tableCount = tableSizes.length;
	const source = 0;
	const teamNodeStart = 1;
	const tableNodeStart = teamNodeStart + teamCount;
	const sink = tableNodeStart + tableCount;
	const graph = Array.from({ length: sink + 1 }, () => []);
	const teamTableEdgeRefs = Array.from({ length: teamCount }, () =>
		Array.from({ length: tableCount }, () => null)
	);

	for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
		addFlowEdge(graph, source, teamNodeStart + teamIndex, teams[teamIndex].players.length);
		for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
			teamTableEdgeRefs[teamIndex][tableIndex] = addFlowEdge(
				graph,
				teamNodeStart + teamIndex,
				tableNodeStart + tableIndex,
				1
			);
		}
	}

	for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
		addFlowEdge(graph, tableNodeStart + tableIndex, sink, tableSizes[tableIndex]);
	}

	const flow = maxFlow(graph, source, sink);
	const counts = Array.from({ length: teamCount }, () => Array(tableCount).fill(0));
	for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
		for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
			const edgeRef = teamTableEdgeRefs[teamIndex][tableIndex];
			const edge = graph[edgeRef.from][edgeRef.edgeIndex];
			counts[teamIndex][tableIndex] = edge.capacity === 0 ? 1 : 0;
		}
	}

	return { counts, flow };
}

function chooseBestTableIndex(
	tableSizes,
	tableLoads,
	teamTableCounts,
	teamAssignedIndexes,
	{ randomize, rng }
) {
	const choices = tableSizes
		.map((size, tableIndex) => ({
			tableIndex,
			size,
			load: tableLoads[tableIndex],
			sameTeamCount: teamTableCounts[tableIndex],
		}))
		.filter((entry) => entry.load < entry.size)
		.map((entry) => {
			const fillRatio = entry.load / entry.size;
			const minDistance = teamAssignedIndexes.length
				? Math.min(
						...teamAssignedIndexes.map((assignedIndex) =>
							Math.abs(assignedIndex - entry.tableIndex)
						)
					)
				: tableSizes.length;
			const totalDistance = teamAssignedIndexes.reduce(
				(distance, assignedIndex) => distance + Math.abs(assignedIndex - entry.tableIndex),
				0
			);

			return {
				...entry,
				fillRatio,
				minDistance,
				totalDistance,
				randomTie: randomize ? rng() : 0,
			};
		});

	choices.sort((a, b) => {
		if (a.sameTeamCount !== b.sameTeamCount) {
			return a.sameTeamCount - b.sameTeamCount;
		}
		if (a.minDistance !== b.minDistance) {
			return b.minDistance - a.minDistance;
		}
		if (a.totalDistance !== b.totalDistance) {
			return b.totalDistance - a.totalDistance;
		}
		if (a.fillRatio !== b.fillRatio) {
			return a.fillRatio - b.fillRatio;
		}
		if (a.load !== b.load) {
			return a.load - b.load;
		}
		if (a.randomTie !== b.randomTie) {
			return a.randomTie - b.randomTie;
		}
		return a.tableIndex - b.tableIndex;
	});

	return choices[0]?.tableIndex ?? -1;
}

function distributeRemainingSeats(teams, tableSizes, teamTableCounts, { randomize, rng }) {
	const tableLoads = Array(tableSizes.length).fill(0);
	const remainingByTeam = teams.map((team, teamIndex) => {
		const assigned = sum(teamTableCounts[teamIndex]);
		return team.players.length - assigned;
	});
	const teamAssignedIndexes = teamTableCounts.map((counts) =>
		counts.flatMap((count, tableIndex) => Array.from({ length: count }, () => tableIndex))
	);

	for (let tableIndex = 0; tableIndex < tableSizes.length; tableIndex += 1) {
		for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
			tableLoads[tableIndex] += teamTableCounts[teamIndex][tableIndex];
		}
	}

	let remainingTotal = remainingByTeam.reduce((total, value) => total + value, 0);
	while (remainingTotal > 0) {
		const teamOrder = remainingByTeam
			.map((remaining, teamIndex) => ({
				remaining,
				teamIndex,
				randomTie: randomize ? rng() : 0,
			}))
			.filter((entry) => entry.remaining > 0)
			.sort((a, b) => {
				if (a.remaining !== b.remaining) {
					return b.remaining - a.remaining;
				}
				if (a.randomTie !== b.randomTie) {
					return a.randomTie - b.randomTie;
				}
				return a.teamIndex - b.teamIndex;
			});

		let placedThisPass = false;
		for (const { teamIndex } of teamOrder) {
			const tableIndex = chooseBestTableIndex(
				tableSizes,
				tableLoads,
				teamTableCounts[teamIndex],
				teamAssignedIndexes[teamIndex],
				{ randomize, rng }
			);
			if (tableIndex === -1) {
				continue;
			}

			teamTableCounts[teamIndex][tableIndex] += 1;
			teamAssignedIndexes[teamIndex].push(tableIndex);
			tableLoads[tableIndex] += 1;
			remainingByTeam[teamIndex] -= 1;
			remainingTotal -= 1;
			placedThisPass = true;
			if (remainingTotal === 0) {
				break;
			}
		}

		if (!placedThisPass) {
			throw new Error('Unable to place all players across the selected draft tables.');
		}
	}

	return teamTableCounts;
}

function summarizeAssignments(tables) {
	let sameTableTeammatePairs = 0;
	let maxTeammatesAtSingleTable = 0;

	for (const table of tables) {
		for (const count of table.teamCounts.values()) {
			sameTableTeammatePairs += teammatePairs(count);
			if (count > maxTeammatesAtSingleTable) {
				maxTeammatesAtSingleTable = count;
			}
		}
	}

	return { sameTableTeammatePairs, maxTeammatesAtSingleTable };
}

export function assignPlayersToDraftTables(event, tableSizes, options = {}) {
	const { randomize = false, rng = Math.random } = options;

	if (!Array.isArray(tableSizes) || !tableSizes.length) {
		throw new Error('At least one draft table is required.');
	}
	if (!tableSizes.every((size) => isPositiveInteger(size))) {
		throw new Error('Draft table sizes must be positive integers.');
	}

	const allPlayers = event.teams.flatMap((team) =>
		team.players.map((player) => ({
			playerId: player.id,
			playerName: player.name,
			teamId: team.id,
			teamName: team.name,
		}))
	);
	const expectedTotalPlayers = allPlayers.length;
	if (sum(tableSizes) !== expectedTotalPlayers) {
		throw new Error(
			`Draft table sizes must sum to ${expectedTotalPlayers} players for this event.`
		);
	}

	const teamRandomOrder = new Map(event.teams.map((team) => [team.id, randomize ? rng() : 0]));
	const orderedTeams = [...event.teams].sort((a, b) => {
		if (a.players.length !== b.players.length) {
			return b.players.length - a.players.length;
		}
		if (randomize) {
			return teamRandomOrder.get(a.id) - teamRandomOrder.get(b.id);
		}
		return a.name.localeCompare(b.name);
	});

	const tables = tableSizes.map((capacity, index) => ({
		tableNumber: index + 1,
		capacity,
		players: [],
		teamCounts: new Map(),
	}));

	const uniquePlan = assignUniqueSeatCounts(orderedTeams, tableSizes);
	const teamTableCounts = distributeRemainingSeats(orderedTeams, tableSizes, uniquePlan.counts, {
		randomize,
		rng,
	});

	for (let teamIndex = 0; teamIndex < orderedTeams.length; teamIndex += 1) {
		const team = orderedTeams[teamIndex];
		const teamPlayers = [...team.players].sort((a, b) => a.name.localeCompare(b.name));
		const randomizedTeamPlayers = randomize ? shuffle(teamPlayers, rng) : teamPlayers;
		const assignedTableIndexes = teamTableCounts[teamIndex].flatMap((count, tableIndex) =>
			Array.from({ length: count }, () => tableIndex)
		);
		const randomizedTableIndexes = randomize
			? shuffle(assignedTableIndexes, rng)
			: assignedTableIndexes;

		if (randomizedTableIndexes.length !== randomizedTeamPlayers.length) {
			throw new Error('Unable to place all players across the selected draft tables.');
		}

		for (let playerIndex = 0; playerIndex < randomizedTeamPlayers.length; playerIndex += 1) {
			const tableIndex = randomizedTableIndexes[playerIndex];
			const table = tables[tableIndex];
			const player = randomizedTeamPlayers[playerIndex];

			table.players.push({
				playerId: player.id,
				playerName: player.name,
				teamId: team.id,
				teamName: team.name,
			});
			table.teamCounts.set(team.id, (table.teamCounts.get(team.id) ?? 0) + 1);
		}
	}

	for (const table of tables) {
		if (table.players.length !== table.capacity) {
			throw new Error('Unable to fill selected draft table capacities exactly.');
		}
	}

	const summary = summarizeAssignments(tables);
	return {
		tableSizes: [...tableSizes],
		tables: tables.map((table) => ({
			tableNumber: table.tableNumber,
			capacity: table.capacity,
			players: table.players,
		})),
		...summary,
	};
}
