import { getDefaultPlayerName } from './playerDisplay.js';

const MATCH_POINTS = {
	win: 3,
	draw: 1,
	loss: 0,
};

export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 16;
export const MIN_PLAYERS_PER_TEAM = 1;
export const MAX_PLAYERS_PER_TEAM = 8;

function validateEventStructure(teamCount, playersPerTeam) {
	if (
		!Number.isInteger(teamCount) ||
		teamCount < MIN_TEAM_COUNT ||
		teamCount > MAX_TEAM_COUNT
	) {
		throw new Error(
			`Team count must be a whole number between ${MIN_TEAM_COUNT} and ${MAX_TEAM_COUNT}.`
		);
	}
	if (
		!Number.isInteger(playersPerTeam) ||
		playersPerTeam < MIN_PLAYERS_PER_TEAM ||
		playersPerTeam > MAX_PLAYERS_PER_TEAM
	) {
		throw new Error(
			`Players per team must be a whole number between ${MIN_PLAYERS_PER_TEAM} and ${MAX_PLAYERS_PER_TEAM}.`
		);
	}
}

export function createTeam(index, playersPerTeam) {
	return {
		id: crypto.randomUUID(),
		name: `Team ${index + 1}`,
		players: Array.from({ length: playersPerTeam }, (_, pIndex) => ({
			id: crypto.randomUUID(),
			name: getDefaultPlayerName(pIndex),
		})),
	};
}

export function createEvent({ name, teamCount, playersPerTeam }) {
	validateEventStructure(teamCount, playersPerTeam);
	return {
		id: crypto.randomUUID(),
		name: name?.trim() || `Event ${new Date().toLocaleDateString()}`,
		createdAt: new Date().toISOString(),
		playersPerTeam,
		teams: Array.from({ length: teamCount }, (_, index) => createTeam(index, playersPerTeam)),
		rounds: [],
	};
}

function resizeTeamPlayers(team, playersPerTeam) {
	if (team.players.length === playersPerTeam) {
		return team;
	}

	if (team.players.length > playersPerTeam) {
		return {
			...team,
			players: team.players.slice(0, playersPerTeam),
		};
	}

	const appendedPlayers = Array.from(
		{ length: playersPerTeam - team.players.length },
		(_, offset) => ({
			id: crypto.randomUUID(),
			name: getDefaultPlayerName(team.players.length + offset),
		})
	);
	return {
		...team,
		players: [...team.players, ...appendedPlayers],
	};
}

function shuffle(values, rng) {
	const shuffled = [...values];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(rng() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
	}
	return shuffled;
}

export function resizeEventStructure(event, { teamCount, playersPerTeam }) {
	validateEventStructure(teamCount, playersPerTeam);

	const nextTeams = [];
	const reusedTeams = event.teams.slice(0, teamCount);
	for (let index = 0; index < reusedTeams.length; index += 1) {
		nextTeams.push(resizeTeamPlayers(reusedTeams[index], playersPerTeam));
	}

	for (let index = reusedTeams.length; index < teamCount; index += 1) {
		nextTeams.push(createTeam(index, playersPerTeam));
	}

	const structureChanged =
		event.teams.length !== teamCount ||
		event.playersPerTeam !== playersPerTeam ||
		nextTeams.some((team) => team.players.length !== playersPerTeam);

	return {
		...event,
		playersPerTeam,
		teams: nextTeams,
		rounds: structureChanged ? [] : event.rounds,
	};
}

function getOpponentCount(opponentCounts, teamId, opponentId) {
	return opponentCounts.get(teamId)?.get(opponentId) ?? 0;
}

function incrementOpponentCount(opponentCounts, teamId, opponentId) {
	const teamCounts = opponentCounts.get(teamId) ?? new Map();
	teamCounts.set(opponentId, (teamCounts.get(opponentId) ?? 0) + 1);
	opponentCounts.set(teamId, teamCounts);
}

function decrementOpponentCount(opponentCounts, teamId, opponentId) {
	const teamCounts = opponentCounts.get(teamId);
	if (!teamCounts) {
		return;
	}
	const nextValue = (teamCounts.get(opponentId) ?? 0) - 1;
	if (nextValue <= 0) {
		teamCounts.delete(opponentId);
	} else {
		teamCounts.set(opponentId, nextValue);
	}
	if (teamCounts.size === 0) {
		opponentCounts.delete(teamId);
	}
}

function teamOpponentCountsMap(event) {
	const opponentCounts = new Map();
	for (const round of event.rounds) {
		for (const match of round.matches) {
			const seatCount = match.playerMatches.length || 1;
			for (let seat = 0; seat < seatCount; seat += 1) {
				incrementOpponentCount(opponentCounts, match.teamAId, match.teamBId);
				incrementOpponentCount(opponentCounts, match.teamBId, match.teamAId);
			}
		}
	}
	return opponentCounts;
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

function playerRoundCountsMap(event) {
	const counts = new Map();
	for (const round of event.rounds) {
		for (const match of round.matches) {
			for (const playerMatch of match.playerMatches) {
				counts.set(
					playerMatch.teamAPlayerId,
					(counts.get(playerMatch.teamAPlayerId) ?? 0) + 1
				);
				counts.set(
					playerMatch.teamBPlayerId,
					(counts.get(playerMatch.teamBPlayerId) ?? 0) + 1
				);
			}
		}
	}
	return counts;
}

function getStandingsMap(event) {
	const standings = calculateStandings(event);
	return new Map(standings.map((entry) => [entry.teamId, entry]));
}

function scoreSort(teamA, teamB, standingsMap, teamTieBreakers) {
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
	if (teamTieBreakers) {
		const tieBreakA = teamTieBreakers.get(teamA.id) ?? 0;
		const tieBreakB = teamTieBreakers.get(teamB.id) ?? 0;
		if (tieBreakA !== tieBreakB) {
			return tieBreakA - tieBreakB;
		}
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

function pairScore(
	playerA,
	playerB,
	standingsRank,
	playerOpponentsByTeam,
	historicalTeamOpponents,
	currentRoundTeamOpponents
) {
	const opponentTeamsForA = playerOpponentsByTeam.get(playerA.id) ?? new Set();
	const opponentTeamsForB = playerOpponentsByTeam.get(playerB.id) ?? new Set();
	const aNewTeam = opponentTeamsForA.has(playerB.teamId) ? 0 : 12;
	const bNewTeam = opponentTeamsForB.has(playerA.teamId) ? 0 : 12;
	const aRank = standingsRank.get(playerA.teamId) ?? standingsRank.size;
	const bRank = standingsRank.get(playerB.teamId) ?? standingsRank.size;
	const swissProximity = Math.max(0, 6 - Math.abs(aRank - bRank));
	const historicalMeetCount = getOpponentCount(
		historicalTeamOpponents,
		playerA.teamId,
		playerB.teamId
	);
	const roundMeetCount = getOpponentCount(
		currentRoundTeamOpponents,
		playerA.teamId,
		playerB.teamId
	);
	const totalMeetCount = historicalMeetCount + roundMeetCount;
	const newTeamSpreadBonus = totalMeetCount === 0 ? 36 : 0;
	const repeatMeetPenalty = totalMeetCount * 10;
	const roundDuplicatePenalty = roundMeetCount * 40;

	return (
		aNewTeam +
		bNewTeam +
		swissProximity +
		newTeamSpreadBonus -
		repeatMeetPenalty -
		roundDuplicatePenalty
	);
}

function tryPairPlayers(
	players,
	standingsRank,
	playerOpponentsByTeam,
	historicalTeamOpponents,
	currentRoundTeamOpponents,
	playerTieBreakers
) {
	if (players.length === 0) {
		return [];
	}

	const orderedPlayers = [...players].sort((a, b) => {
		const aOptions = availableOpponentCount(a, players, playerOpponentsByTeam);
		const bOptions = availableOpponentCount(b, players, playerOpponentsByTeam);
		if (aOptions !== bOptions) {
			return aOptions - bOptions;
		}
		const aRank = standingsRank.get(a.teamId) ?? 0;
		const bRank = standingsRank.get(b.teamId) ?? 0;
		if (aRank !== bRank) {
			return aRank - bRank;
		}
		const aTieBreak = playerTieBreakers.get(a.id) ?? 0;
		const bTieBreak = playerTieBreakers.get(b.id) ?? 0;
		if (aTieBreak !== bTieBreak) {
			return aTieBreak - bTieBreak;
		}
		return a.id.localeCompare(b.id);
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
				historicalTeamOpponents,
				currentRoundTeamOpponents
			),
			tieBreak: playerTieBreakers.get(candidate.id) ?? 0,
		}))
		.sort((a, b) => {
			if (a.score !== b.score) {
				return b.score - a.score;
			}
			if (a.tieBreak !== b.tieBreak) {
				return a.tieBreak - b.tieBreak;
			}
			return a.candidate.id.localeCompare(b.candidate.id);
		})
		.map((entry) => entry.candidate);

	for (const candidate of candidates) {
		const remainder = rest.filter((player) => player.id !== candidate.id);
		incrementOpponentCount(currentRoundTeamOpponents, first.teamId, candidate.teamId);
		incrementOpponentCount(currentRoundTeamOpponents, candidate.teamId, first.teamId);
		const recursion = tryPairPlayers(
			remainder,
			standingsRank,
			playerOpponentsByTeam,
			historicalTeamOpponents,
			currentRoundTeamOpponents,
			playerTieBreakers
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
		decrementOpponentCount(currentRoundTeamOpponents, first.teamId, candidate.teamId);
		decrementOpponentCount(currentRoundTeamOpponents, candidate.teamId, first.teamId);
	}

	return null;
}

export function generateNextRound(event, options = {}) {
	const { randomize = false, rng = Math.random } = options;
	const allPlayers = event.teams.flatMap((team) =>
		team.players.map((player) => ({ id: player.id, teamId: team.id }))
	);
	let playersForPairing = randomize ? shuffle(allPlayers, rng) : allPlayers;

	const standingsMap = getStandingsMap(event);
	const teamTieBreakers = new Map(event.teams.map((team) => [team.id, randomize ? rng() : 0]));
	const orderedTeams = [...event.teams].sort((a, b) =>
		scoreSort(a, b, standingsMap, randomize ? teamTieBreakers : null)
	);
	const standingsRank = new Map(orderedTeams.map((team, index) => [team.id, index]));
	if (playersForPairing.length % 2 !== 0) {
		const participationCounts = playerRoundCountsMap(event);
		const byeCandidates = [...playersForPairing].sort((a, b) => {
			const aCount = participationCounts.get(a.id) ?? 0;
			const bCount = participationCounts.get(b.id) ?? 0;
			if (aCount !== bCount) {
				return aCount - bCount;
			}
			const aRank = standingsRank.get(a.teamId) ?? standingsRank.size;
			const bRank = standingsRank.get(b.teamId) ?? standingsRank.size;
			if (aRank !== bRank) {
				return bRank - aRank;
			}
			return a.id.localeCompare(b.id);
		});
		const byePlayer = byeCandidates[0];
		playersForPairing = playersForPairing.filter((player) => player.id !== byePlayer.id);
	}
	const historicalTeamOpponents = teamOpponentCountsMap(event);
	const currentRoundTeamOpponents = new Map();
	const playerOpponentsByTeam = playerOpponentTeamsMap(event);
	const playerTieBreakers = new Map(
		playersForPairing.map((player, index) => [player.id, randomize ? rng() : index])
	);
	const pairings = tryPairPlayers(
		playersForPairing,
		standingsRank,
		playerOpponentsByTeam,
		historicalTeamOpponents,
		currentRoundTeamOpponents,
		playerTieBreakers
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
