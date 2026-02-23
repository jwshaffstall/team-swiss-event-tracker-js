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

function existingOpponentSet(event) {
	const seen = new Set();
	for (const round of event.rounds) {
		for (const match of round.matches) {
			seen.add(orderedPairKey(match.teamAId, match.teamBId));
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

function tryPairTeams(teams, seenOpponents, allowRematch = false) {
	if (teams.length === 0) {
		return [];
	}

	const [first, ...rest] = teams;
	for (let index = 0; index < rest.length; index += 1) {
		const candidate = rest[index];
		const alreadyPlayed = seenOpponents.has(orderedPairKey(first.id, candidate.id));
		if (!allowRematch && alreadyPlayed) {
			continue;
		}
		const remainder = rest.filter((_, restIndex) => restIndex !== index);
		const recursion = tryPairTeams(remainder, seenOpponents, allowRematch);
		if (recursion) {
			return [{ teamAId: first.id, teamBId: candidate.id }, ...recursion];
		}
	}
	return null;
}

export function generateNextRound(event) {
	if (event.teams.length % 2 !== 0) {
		throw new Error('Team count must be even for pairings.');
	}
	const standingsMap = getStandingsMap(event);
	const orderedTeams = [...event.teams].sort((a, b) => scoreSort(a, b, standingsMap));
	const seenOpponents = existingOpponentSet(event);
	let pairings = tryPairTeams(orderedTeams, seenOpponents, false);
	if (!pairings) {
		pairings = tryPairTeams(orderedTeams, seenOpponents, true);
	}
	if (!pairings) {
		throw new Error('Could not generate valid pairings for this round.');
	}

	const matches = pairings.map((pair) => {
		const teamA = event.teams.find((team) => team.id === pair.teamAId);
		const teamB = event.teams.find((team) => team.id === pair.teamBId);
		return {
			id: crypto.randomUUID(),
			teamAId: pair.teamAId,
			teamBId: pair.teamBId,
			playerMatches: Array.from({ length: event.playersPerTeam }, (_, seat) => ({
				id: crypto.randomUUID(),
				seat,
				teamAPlayerId: teamA.players[seat]?.id,
				teamBPlayerId: teamB.players[seat]?.id,
				winsA: 0,
				winsB: 0,
				draws: 0,
			})),
		};
	});

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
