const MATCH_POINTS = {
	win: 3,
	draw: 1,
	loss: 0,
};

export function createTeam(index, playersPerTeam) {
	return {
		id: crypto.randomUUID(),
		name: `Team ${index + 1}`,
		players: Array.from({ length: playersPerTeam }, (_, pIndex) => ({
			id: crypto.randomUUID(),
			name: `Player ${index + 1}.${pIndex + 1}`,
		})),
	};
}

export function createEvent({ name, teamCount, playersPerTeam }) {
	return {
		id: crypto.randomUUID(),
		name: name?.trim() || `Event ${new Date().toLocaleDateString()}`,
		createdAt: new Date().toISOString(),
		playersPerTeam,
		teams: Array.from({ length: teamCount }, (_, index) => createTeam(index, playersPerTeam)),
		rounds: [],
	};
}

function orderedPairKey(a, b) {
	return [a, b].sort().join(':');
}

function existingTeamOpponentSet(event) {
	const seen = new Set();
	for (const round of event.rounds) {
		for (const match of round.matches) {
			seen.add(orderedPairKey(match.teamAId, match.teamBId));
		}
	}
	return seen;
}

function playerOpponentTeamsMap(event) {
	const seen = new Map();
	for (const team of event.teams) {
		for (const player of team.players) {
			seen.set(player.id, new Set());
		}
	}

	for (const round of event.rounds) {
		for (const match of round.matches) {
			for (const playerMatch of match.playerMatches) {
				seen.get(playerMatch.teamAPlayerId)?.add(match.teamBId);
				seen.get(playerMatch.teamBPlayerId)?.add(match.teamAId);
			}
		}
	}

	return seen;
}

function getStandingsMap(event) {
	const standings = calculateStandings(event);
	return new Map(standings.map((entry) => [entry.teamId, entry]));
}

function scoreSort(teamA, teamB, standingsMap) {
	const a = standingsMap.get(teamA.id);
	const b = standingsMap.get(teamB.id);
	if (!a || !b) {
		return teamA.name.localeCompare(teamB.name);
	}
	if (a.matchPoints !== b.matchPoints) {
		return b.matchPoints - a.matchPoints;
	}
	if (a.gamePoints !== b.gamePoints) {
		return b.gamePoints - a.gamePoints;
	}
	return teamA.name.localeCompare(teamB.name);
}

function availableOpponentCount(player, players, playerOpponentsByTeam) {
	const knownOpponents = playerOpponentsByTeam.get(player.id) ?? new Set();
	return (
		players.filter((candidate) => candidate.teamId !== player.teamId).length +
		players.filter(
			(candidate) =>
				candidate.teamId !== player.teamId && !knownOpponents.has(candidate.teamId)
		).length
	);
}

function pairScore(playerA, playerB, standingsRank, playerOpponentsByTeam, seenTeamOpponents) {
	const opponentTeamsForA = playerOpponentsByTeam.get(playerA.id) ?? new Set();
	const opponentTeamsForB = playerOpponentsByTeam.get(playerB.id) ?? new Set();
	const aNewTeam = opponentTeamsForA.has(playerB.teamId) ? 0 : 12;
	const bNewTeam = opponentTeamsForB.has(playerA.teamId) ? 0 : 12;
	const aRank = standingsRank.get(playerA.teamId) ?? standingsRank.size;
	const bRank = standingsRank.get(playerB.teamId) ?? standingsRank.size;
	const swissProximity = Math.max(0, 8 - Math.abs(aRank - bRank));
	const teamRematchPenalty = seenTeamOpponents.has(orderedPairKey(playerA.teamId, playerB.teamId))
		? -6
		: 0;

	return aNewTeam + bNewTeam + swissProximity + teamRematchPenalty;
}

function tryPairPlayers(players, standingsRank, playerOpponentsByTeam, seenTeamOpponents) {
	if (players.length === 0) {
		return [];
	}

	const orderedPlayers = [...players].sort((a, b) => {
		const aOptions = availableOpponentCount(a, players, playerOpponentsByTeam);
		const bOptions = availableOpponentCount(b, players, playerOpponentsByTeam);
		if (aOptions !== bOptions) {
			return aOptions - bOptions;
		}
		return (standingsRank.get(a.teamId) ?? 0) - (standingsRank.get(b.teamId) ?? 0);
	});

	const [first, ...rest] = orderedPlayers;
	const candidates = rest
		.filter((candidate) => candidate.teamId !== first.teamId)
		.map((candidate) => ({
			candidate,
			score: pairScore(
				first,
				candidate,
				standingsRank,
				playerOpponentsByTeam,
				seenTeamOpponents
			),
		}))
		.sort((a, b) => b.score - a.score)
		.map((entry) => entry.candidate);

	for (const candidate of candidates) {
		const remainder = rest.filter((player) => player.id !== candidate.id);
		const recursion = tryPairPlayers(
			remainder,
			standingsRank,
			playerOpponentsByTeam,
			seenTeamOpponents
		);
		if (recursion) {
			return [
				{
					teamAId: first.teamId,
					teamBId: candidate.teamId,
					playerAId: first.id,
					playerBId: candidate.id,
				},
				...recursion,
			];
		}
	}

	return null;
}

export function generateNextRound(event) {
	if (event.teams.length % 2 !== 0) {
		throw new Error('Team count must be even for pairings.');
	}
	const allPlayers = event.teams.flatMap((team) =>
		team.players.map((player) => ({ id: player.id, teamId: team.id }))
	);
	if (allPlayers.length % 2 !== 0) {
		throw new Error('Total player count must be even for pairings.');
	}

	const standingsMap = getStandingsMap(event);
	const orderedTeams = [...event.teams].sort((a, b) => scoreSort(a, b, standingsMap));
	const standingsRank = new Map(orderedTeams.map((team, index) => [team.id, index]));
	const seenTeamOpponents = existingTeamOpponentSet(event);
	const playerOpponentsByTeam = playerOpponentTeamsMap(event);
	const pairings = tryPairPlayers(
		allPlayers,
		standingsRank,
		playerOpponentsByTeam,
		seenTeamOpponents
	);
	if (!pairings) {
		throw new Error('Could not generate valid pairings for this round.');
	}

	const matches = pairings.map((pair) => ({
		id: crypto.randomUUID(),
		teamAId: pair.teamAId,
		teamBId: pair.teamBId,
		playerMatches: [
			{
				id: crypto.randomUUID(),
				seat: 0,
				teamAPlayerId: pair.playerAId,
				teamBPlayerId: pair.playerBId,
				winsA: 0,
				winsB: 0,
				draws: 0,
			},
		],
	}));

	return {
		...event,
		rounds: [
			...event.rounds,
			{
				id: crypto.randomUUID(),
				roundNumber: event.rounds.length + 1,
				matches,
			},
		],
	};
}

function summarizeTeamMatch(match) {
	let teamAWins = 0;
	let teamBWins = 0;
	let gameWinsA = 0;
	let gameWinsB = 0;

	for (const playerMatch of match.playerMatches) {
		gameWinsA += Number(playerMatch.winsA) || 0;
		gameWinsB += Number(playerMatch.winsB) || 0;
		if (playerMatch.winsA > playerMatch.winsB) {
			teamAWins += 1;
		} else if (playerMatch.winsB > playerMatch.winsA) {
			teamBWins += 1;
		}
	}

	return { teamAWins, teamBWins, gameWinsA, gameWinsB };
}

export function calculateStandings(event) {
	const table = new Map(
		event.teams.map((team) => [
			team.id,
			{
				teamId: team.id,
				teamName: team.name,
				matchPoints: 0,
				matchWins: 0,
				matchLosses: 0,
				matchDraws: 0,
				gamePoints: 0,
				gameWins: 0,
				gameLosses: 0,
				opponents: [],
			},
		])
	);

	for (const round of event.rounds) {
		for (const match of round.matches) {
			const result = summarizeTeamMatch(match);
			const teamA = table.get(match.teamAId);
			const teamB = table.get(match.teamBId);

			teamA.opponents.push(match.teamBId);
			teamB.opponents.push(match.teamAId);
			teamA.gamePoints += result.gameWinsA;
			teamB.gamePoints += result.gameWinsB;
			teamA.gameWins += result.gameWinsA;
			teamA.gameLosses += result.gameWinsB;
			teamB.gameWins += result.gameWinsB;
			teamB.gameLosses += result.gameWinsA;

			if (result.teamAWins > result.teamBWins) {
				teamA.matchPoints += MATCH_POINTS.win;
				teamB.matchPoints += MATCH_POINTS.loss;
				teamA.matchWins += 1;
				teamB.matchLosses += 1;
			} else if (result.teamBWins > result.teamAWins) {
				teamB.matchPoints += MATCH_POINTS.win;
				teamA.matchPoints += MATCH_POINTS.loss;
				teamB.matchWins += 1;
				teamA.matchLosses += 1;
			} else {
				teamA.matchPoints += MATCH_POINTS.draw;
				teamB.matchPoints += MATCH_POINTS.draw;
				teamA.matchDraws += 1;
				teamB.matchDraws += 1;
			}
		}
	}

	for (const row of table.values()) {
		const opponentPoints = row.opponents.map(
			(opponentId) => table.get(opponentId)?.matchPoints ?? 0
		);
		row.buchholz = opponentPoints.reduce((sum, points) => sum + points, 0);
		row.opponentMatchWinRate = opponentPoints.length
			? row.buchholz / (opponentPoints.length * 3)
			: 0;
	}

	return [...table.values()].sort((a, b) => {
		if (a.matchPoints !== b.matchPoints) {
			return b.matchPoints - a.matchPoints;
		}
		if (a.buchholz !== b.buchholz) {
			return b.buchholz - a.buchholz;
		}
		if (a.gamePoints !== b.gamePoints) {
			return b.gamePoints - a.gamePoints;
		}
		return a.teamName.localeCompare(b.teamName);
	});
}

export function validatePlayerMatchScore(winsA, winsB, draws = 0) {
	const a = Number(winsA);
	const b = Number(winsB);
	const d = Number(draws);
	if (
		!Number.isInteger(a) ||
		!Number.isInteger(b) ||
		!Number.isInteger(d) ||
		a < 0 ||
		b < 0 ||
		d < 0
	) {
		return false;
	}
	if (a > 2 || b > 2) {
		return false;
	}
	return a + b + d <= 3;
}
