import { downloadPublishedHtml } from './lib/publish.js';
import { loadState, saveState } from './lib/storage.js';
import { assignPlayersToDraftTables, buildBalancedTableSizes } from './lib/draftTables.js';
import {
	formatPlayerDisplayName,
	getDefaultPlayerName,
	getPlayerBaseName,
	getTeamInitials,
	getTeamPlayerNumber,
} from './lib/playerDisplay.js';
import {
	calculateStandings,
	createEvent,
	generateNextRound,
	resizeEventStructure,
	validatePlayerMatchScore,
} from './lib/swiss.js';

const app = document.querySelector('#app');
const state = loadState();
const uiState = {
	matchupTeamId: null,
	draftLayoutMode: true,
	draftTableCount: null,
	draftShuffleNonce: 0,
};

if (!state.events.length) {
	state.events.push(createEvent({ name: 'Sample Event', teamCount: 8, playersPerTeam: 3 }));
	state.activeEventId = state.events[0].id;
	saveState(state);
}

function getActiveEvent() {
	return state.events.find((event) => event.id === state.activeEventId) ?? null;
}

function persistAndRender() {
	saveState(state);
	render();
}

function updateActiveEvent(mutator) {
	const index = state.events.findIndex((event) => event.id === state.activeEventId);
	if (index === -1) {
		return;
	}
	state.events[index] = mutator(structuredClone(state.events[index]));
	persistAndRender();
}

function hashString(value) {
	let hash = 2166136261;
	for (const char of value) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function createSeededRng(seed) {
	let stateValue = seed >>> 0;
	return () => {
		stateValue = (stateValue + 0x6d2b79f5) | 0;
		let next = Math.imul(stateValue ^ (stateValue >>> 15), 1 | stateValue);
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
	};
}

function hasEnteredScores(round) {
	return round.matches.some((match) =>
		match.playerMatches.some(
			(playerMatch) =>
				(playerMatch.winsA ?? 0) !== 0 ||
				(playerMatch.winsB ?? 0) !== 0 ||
				(playerMatch.draws ?? 0) !== 0
		)
	);
}

function reshuffleLatestRound(event) {
	if (!event.rounds.length) {
		throw new Error('No rounds available to reshuffle.');
	}

	const previousRounds = event.rounds.slice(0, -1);
	const latestRound = event.rounds[event.rounds.length - 1];
	const baseEvent = { ...event, rounds: previousRounds };
	const regenerated = generateNextRound(baseEvent, { randomize: true });
	const shuffledRound = regenerated.rounds[regenerated.rounds.length - 1];

	return {
		...event,
		rounds: [
			...previousRounds,
			{
				...shuffledRound,
				id: latestRound.id,
				roundNumber: latestRound.roundNumber,
			},
		],
	};
}

function renderEventSelector(activeEvent) {
	const options = state.events
		.map(
			(event) =>
				`<option value="${event.id}" ${event.id === activeEvent.id ? 'selected' : ''}>${event.name}</option>`
		)
		.join('');
	return `<label>Event<select id="event-select">${options}</select></label>`;
}

function renderTeamEditor(event) {
	return event.teams
		.map(
			(team) => `<article class="card">
	<h3><input data-team-name="${team.id}" value="${team.name}" /></h3>
	<ul>
		${team.players
			.map((player) => {
				const initials = getTeamInitials(team.name);
				const playerNumber = getTeamPlayerNumber(team, player.id);
				const playerValue = getPlayerBaseName(team, player);
				return `<li><label class="player-edit-label"><span class="player-prefix">${initials}-${playerNumber}</span><input data-player-name="${team.id}:${player.id}" value="${playerValue}" /></label></li>`;
			})
			.join('')}
	</ul>
</article>`
		)
		.join('');
}

function renderPairings(event) {
	const teamMap = new Map(event.teams.map((team) => [team.id, team]));
	return event.rounds
		.map((round) => {
			const matches = round.matches
				.map((match) => {
					const teamA = teamMap.get(match.teamAId);
					const teamB = teamMap.get(match.teamBId);
					const seatRows = match.playerMatches
						.map((pm) => {
							const playerA = teamA.players.find(
								(player) => player.id === pm.teamAPlayerId
							);
							const playerB = teamB.players.find(
								(player) => player.id === pm.teamBPlayerId
							);
							return `<tr>
		<td>${pm.seat + 1}</td>
		<td>${playerA ? formatPlayerDisplayName(teamA, playerA) : 'Unknown'}</td>
		<td><input type="number" min="0" max="2" data-score="${round.id}:${match.id}:${pm.id}:A" value="${pm.winsA}" /></td>
		<td><input type="number" min="0" max="3" data-score="${round.id}:${match.id}:${pm.id}:D" value="${pm.draws ?? 0}" /></td>
		<td><input type="number" min="0" max="2" data-score="${round.id}:${match.id}:${pm.id}:B" value="${pm.winsB}" /></td>
		<td>${playerB ? formatPlayerDisplayName(teamB, playerB) : 'Unknown'}</td>
	</tr>`;
						})
						.join('');
					return `<article class="card"><h3>${teamA.name} vs ${teamB.name}</h3>
	<div class="table-wrap"><table><thead><tr><th>Seat</th><th>${teamA.name}</th><th>Wins</th><th>Draws</th><th>Wins</th><th>${teamB.name}</th></tr></thead><tbody>${seatRows}</tbody></table></div>
</article>`;
				})
				.join('');
			return `<section><h2>Round ${round.roundNumber}</h2>${matches}</section>`;
		})
		.join('');
}

function renderStandings(event) {
	const headerTooltips = {
		MP: 'Match Points: 3 for a team win, 1 for a draw, 0 for a loss.',
		WDL: 'Match record shown as Wins-Draws-Losses.',
		Buchholz: 'Total match points earned by all opponents faced.',
		'OMW%': 'Opponent Match Win %: opponent match points divided by max possible points.',
		'Game Pts': 'Total individual game wins scored across all seats and rounds.',
	};
	const standings = calculateStandings(event);
	const rows = standings
		.map(
			(row, index) => `<tr>
	<td>${index + 1}</td><td>${row.teamName}</td><td>${row.matchPoints}</td><td>${row.matchWins}-${row.matchDraws}-${row.matchLosses}</td>
	<td>${row.buchholz.toFixed(2)}</td><td>${(row.opponentMatchWinRate * 100).toFixed(1)}%</td><td>${row.gamePoints}</td></tr>`
		)
		.join('');
	return `<div class="table-wrap"><table><thead><tr>
	<th>#</th>
	<th>Team</th>
	<th><span class="tooltip-label" tabindex="0" title="${headerTooltips.MP}">MP</span></th>
	<th><span class="tooltip-label" tabindex="0" title="${headerTooltips.WDL}">W-D-L</span></th>
	<th><span class="tooltip-label" tabindex="0" title="${headerTooltips.Buchholz}">Buchholz</span></th>
	<th><span class="tooltip-label" tabindex="0" title="${headerTooltips['OMW%']}">OMW%</span></th>
	<th><span class="tooltip-label" tabindex="0" title="${headerTooltips['Game Pts']}">Game Pts</span></th>
	</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function summarizeMatchupHistory(event, teamId) {
	const teamsById = new Map(event.teams.map((team) => [team.id, team]));
	const selectedTeam = teamsById.get(teamId);
	if (!selectedTeam) {
		return [];
	}

	const historyByOpponent = new Map();
	for (const round of event.rounds) {
		for (const match of round.matches) {
			const isTeamA = match.teamAId === teamId;
			const isTeamB = match.teamBId === teamId;
			if (!isTeamA && !isTeamB) {
				continue;
			}

			const opponentId = isTeamA ? match.teamBId : match.teamAId;
			const opponent = teamsById.get(opponentId);
			const current = historyByOpponent.get(opponentId) ?? {
				opponentName: opponent?.name ?? 'Unknown Team',
				teamMatches: 0,
				teamWins: 0,
				teamDraws: 0,
				teamLosses: 0,
				teamGameWins: 0,
				teamGameLosses: 0,
				playerMatchWins: 0,
				playerMatchDraws: 0,
				playerMatchLosses: 0,
				playerGameWins: 0,
				playerGameDraws: 0,
				playerGameLosses: 0,
			};

			current.teamMatches += 1;
			let seatWins = 0;
			let seatLosses = 0;

			for (const playerMatch of match.playerMatches) {
				const myWins = isTeamA ? playerMatch.winsA : playerMatch.winsB;
				const theirWins = isTeamA ? playerMatch.winsB : playerMatch.winsA;
				const draws = playerMatch.draws ?? 0;

				current.teamGameWins += myWins;
				current.teamGameLosses += theirWins;
				current.playerGameWins += myWins;
				current.playerGameLosses += theirWins;
				current.playerGameDraws += draws;

				if (myWins > theirWins) {
					seatWins += 1;
					current.playerMatchWins += 1;
				} else if (theirWins > myWins) {
					seatLosses += 1;
					current.playerMatchLosses += 1;
				} else {
					current.playerMatchDraws += 1;
				}
			}

			if (seatWins > seatLosses) {
				current.teamWins += 1;
			} else if (seatLosses > seatWins) {
				current.teamLosses += 1;
			} else {
				current.teamDraws += 1;
			}

			historyByOpponent.set(opponentId, current);
		}
	}

	return [...historyByOpponent.values()].sort((a, b) =>
		a.opponentName.localeCompare(b.opponentName)
	);
}

function renderMatchupHistory(event, selectedTeamId) {
	const teamOptions = event.teams
		.map(
			(team) =>
				`<option value="${team.id}" ${team.id === selectedTeamId ? 'selected' : ''}>${team.name}</option>`
		)
		.join('');

	const historyRows = summarizeMatchupHistory(event, selectedTeamId)
		.map(
			(item) => `<tr>
	<td>${item.opponentName}</td>
	<td>${item.teamMatches}</td>
	<td>${item.teamWins}-${item.teamDraws}-${item.teamLosses}</td>
	<td>${item.teamGameWins}-${item.teamGameLosses}</td>
	<td>${item.playerMatchWins}-${item.playerMatchDraws}-${item.playerMatchLosses}</td>
	<td>${item.playerGameWins}-${item.playerGameDraws}-${item.playerGameLosses}</td>
</tr>`
		)
		.join('');

	return `<label class="matchup-select">Team matchup focus
	<select id="matchup-team-select">${teamOptions}</select>
</label>
<div class="table-wrap"><table>
	<thead><tr><th>Opponent Team</th><th>Matches</th><th>Team W-D-L</th><th>Team Games W-L</th><th>Player Seats W-D-L</th><th>Player Games W-D-L</th></tr></thead>
	<tbody>${historyRows || '<tr><td colspan="6">No matchup history yet.</td></tr>'}</tbody>
</table></div>`;
}

function formatTableSizes(tableSizes) {
	return tableSizes.join('/');
}

function getDraftLayoutContext(event) {
	const totalPlayers = event.teams.reduce((count, team) => count + team.players.length, 0);
	if (totalPlayers < 1) {
		return { totalPlayers, minTableCount: 1, maxTableCount: 1, selectedTableCount: 1 };
	}

	const minTableCount = 1;
	const maxTableCount = totalPlayers;
	if (!Number.isInteger(uiState.draftTableCount)) {
		uiState.draftTableCount = Math.max(1, Math.round(totalPlayers / 8));
	}
	const selectedTableCount = Math.min(
		maxTableCount,
		Math.max(minTableCount, uiState.draftTableCount)
	);
	if (selectedTableCount !== uiState.draftTableCount) {
		uiState.draftTableCount = selectedTableCount;
	}
	return { totalPlayers, minTableCount, maxTableCount, selectedTableCount };
}

function renderDraftTableLayout(event) {
	const { totalPlayers, minTableCount, maxTableCount, selectedTableCount } =
		getDraftLayoutContext(event);
	const tableSizes = buildBalancedTableSizes(totalPlayers, selectedTableCount);
	const draftSeed = hashString(`${event.id}:${selectedTableCount}:${uiState.draftShuffleNonce}`);
	const assignment = assignPlayersToDraftTables(event, tableSizes, {
		randomize: true,
		rng: createSeededRng(draftSeed),
	});
	const teammateSummary =
		assignment.sameTableTeammatePairs === 0
			? 'No teammates share a table in this layout.'
			: `${assignment.sameTableTeammatePairs} teammate pairings share a table in this placement.`;
	const formatLabel = selectedTableCount === 1 ? 'table' : 'tables';
	const sealedSummary =
		selectedTableCount === totalPlayers ? ' Sealed-style mode: one player per table.' : '';
	const tableCards = assignment.tables
		.map((table) => {
			const seatRows = table.players
				.map((entry, seatIndex) => {
					const team = event.teams.find((item) => item.id === entry.teamId);
					const player = team?.players.find((item) => item.id === entry.playerId);
					return `<tr>
	<td>${seatIndex + 1}</td>
	<td>${team && player ? formatPlayerDisplayName(team, player) : entry.playerName}</td>
	<td>${entry.teamName}</td>
</tr>`;
				})
				.join('');
			return `<article class="draft-table card">
	<h3>Table ${table.tableNumber} (${table.players.length}/${table.capacity})</h3>
	<div class="table-wrap"><table>
		<thead><tr><th>Seat</th><th>Player</th><th>Team</th></tr></thead>
		<tbody>${seatRows}</tbody>
	</table></div>
</article>`;
		})
		.join('');

	return `<section class="card">
	<h2>Draft Table Placement</h2>
	<div class="draft-controls">
		<label>Draft table count
			<input id="draft-table-count" type="number" min="${minTableCount}" max="${maxTableCount}" value="${selectedTableCount}" />
		</label>
		<button id="reshuffle-draft-tables" type="button">Re-shuffle Draft Tables</button>
		<p class="draft-summary">${totalPlayers} players. ${selectedTableCount} ${formatLabel} (${formatTableSizes(tableSizes)}). ${teammateSummary}${sealedSummary}</p>
	</div>
	<div class="draft-table-grid">${tableCards}</div>
</section>`;
}

function render() {
	const activeEvent = getActiveEvent();
	if (!activeEvent) {
		app.innerHTML = '<p>No events found.</p>';
		return;
	}
	if (
		!uiState.matchupTeamId ||
		!activeEvent.teams.some((team) => team.id === uiState.matchupTeamId)
	) {
		uiState.matchupTeamId = activeEvent.teams[0]?.id ?? null;
	}

	app.innerHTML = `<main>
	<header class="top-row">
		<h1>Team Swiss Tracker</h1>
		<div class="top-controls">
			${renderEventSelector(activeEvent)}
			<label class="toggle-field">
				<span>Draft table mode</span>
				<input id="draft-mode-toggle" type="checkbox" ${uiState.draftLayoutMode ? 'checked' : ''} />
			</label>
		</div>
	</header>
	<section class="toolbar card">
		<label>New event name <input id="new-event-name" placeholder="Weekend League" /></label>
		<label>Teams <input id="new-event-teams" type="number" min="2" step="2" value="8" /></label>
		<label>Players / team <input id="new-event-players" type="number" min="1" value="3" /></label>
		<button id="create-event">Create Event</button>
		<label>Resize teams <input id="resize-event-teams" type="number" min="1" value="${activeEvent.teams.length}" /></label>
		<label>Resize players / team <input id="resize-event-players" type="number" min="1" value="${activeEvent.playersPerTeam}" /></label>
		<button id="resize-event">Apply Event Size</button>
		<button id="delete-event" class="danger">Delete Active Event</button>
		<button id="next-round">Generate Next Round</button>
		<button id="reshuffle-latest-round">Re-shuffle Latest Round</button>
		<button id="publish-event">Publish HTML Snapshot</button>
	</section>
	<section class="card">
		<h2>Teams & Players</h2>
		<div class="teams-grid">${renderTeamEditor(activeEvent)}</div>
	</section>
	${uiState.draftLayoutMode ? renderDraftTableLayout(activeEvent) : ''}
	<section class="card">
		<h2>Standings</h2>
		${renderStandings(activeEvent)}
	</section>
	<section class="card">
		<h2>Team Matchup History</h2>
		${renderMatchupHistory(activeEvent, uiState.matchupTeamId)}
	</section>
	<section class="card">
		<h2>Rounds & Results</h2>
		${activeEvent.rounds.length ? renderPairings(activeEvent) : '<p>No rounds yet.</p>'}
	</section>
</main>`;

	wireHandlers();
}

function wireHandlers() {
	document.querySelector('#event-select').addEventListener('change', (event) => {
		state.activeEventId = event.target.value;
		uiState.matchupTeamId = null;
		uiState.draftShuffleNonce = 0;
		persistAndRender();
	});

	document.querySelector('#draft-mode-toggle').addEventListener('change', (event) => {
		uiState.draftLayoutMode = event.target.checked;
		render();
	});

	const draftTableCountInput = document.querySelector('#draft-table-count');
	if (draftTableCountInput) {
		draftTableCountInput.addEventListener('change', (event) => {
			uiState.draftTableCount = Number(event.target.value);
			render();
		});
	}

	const reshuffleDraftTablesButton = document.querySelector('#reshuffle-draft-tables');
	if (reshuffleDraftTablesButton) {
		reshuffleDraftTablesButton.addEventListener('click', () => {
			uiState.draftShuffleNonce += 1;
			render();
		});
	}

	document.querySelector('#matchup-team-select').addEventListener('change', (event) => {
		uiState.matchupTeamId = event.target.value;
		render();
	});

	document.querySelector('#create-event').addEventListener('click', () => {
		const name = document.querySelector('#new-event-name').value;
		const teamCount = Number(document.querySelector('#new-event-teams').value);
		const playersPerTeam = Number(document.querySelector('#new-event-players').value);
		if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount % 2 !== 0) {
			window.alert('Team count must be an even number >= 2.');
			return;
		}
		if (!Number.isInteger(playersPerTeam) || playersPerTeam < 1) {
			window.alert('Players per team must be >= 1.');
			return;
		}
		const event = createEvent({ name, teamCount, playersPerTeam });
		state.events.push(event);
		state.activeEventId = event.id;
		uiState.draftShuffleNonce = 0;
		persistAndRender();
	});

	document.querySelector('#resize-event').addEventListener('click', () => {
		const teamCount = Number(document.querySelector('#resize-event-teams').value);
		const playersPerTeam = Number(document.querySelector('#resize-event-players').value);
		if (!Number.isInteger(teamCount) || teamCount < 1) {
			window.alert('Team count must be a whole number >= 1.');
			return;
		}
		if (!Number.isInteger(playersPerTeam) || playersPerTeam < 1) {
			window.alert('Players per team must be a whole number >= 1.');
			return;
		}

		const activeEvent = getActiveEvent();
		const structureChanged =
			activeEvent.teams.length !== teamCount || activeEvent.playersPerTeam !== playersPerTeam;
		if (
			structureChanged &&
			activeEvent.rounds.length > 0 &&
			!window.confirm(
				'Changing team count or players per team clears existing rounds. Continue?'
			)
		) {
			return;
		}

		uiState.draftShuffleNonce = 0;
		updateActiveEvent((event) => resizeEventStructure(event, { teamCount, playersPerTeam }));
	});

	document.querySelector('#delete-event').addEventListener('click', () => {
		if (state.events.length === 1) {
			window.alert('At least one event must exist.');
			return;
		}
		state.events = state.events.filter((event) => event.id !== state.activeEventId);
		state.activeEventId = state.events[0].id;
		persistAndRender();
	});

	document.querySelector('#next-round').addEventListener('click', () => {
		try {
			updateActiveEvent((event) => generateNextRound(event, { randomize: true }));
		} catch (error) {
			window.alert(error instanceof Error ? error.message : 'Unable to create next round.');
		}
	});

	document.querySelector('#reshuffle-latest-round').addEventListener('click', () => {
		try {
			const activeEvent = getActiveEvent();
			if (!activeEvent.rounds.length) {
				window.alert('No rounds available to reshuffle.');
				return;
			}
			const latestRound = activeEvent.rounds[activeEvent.rounds.length - 1];
			if (
				hasEnteredScores(latestRound) &&
				!window.confirm(
					'Re-shuffling the latest round will clear scores entered for that round. Continue?'
				)
			) {
				return;
			}
			updateActiveEvent((event) => reshuffleLatestRound(event));
		} catch (error) {
			window.alert(
				error instanceof Error ? error.message : 'Unable to reshuffle the latest round.'
			);
		}
	});

	document.querySelector('#publish-event').addEventListener('click', () => {
		const event = getActiveEvent();
		downloadPublishedHtml(event);
	});

	document.querySelectorAll('[data-team-name]').forEach((input) => {
		input.addEventListener('change', (event) => {
			const teamId = event.target.getAttribute('data-team-name');
			updateActiveEvent((current) => {
				const team = current.teams.find((item) => item.id === teamId);
				team.name = event.target.value.trim() || team.name;
				return current;
			});
		});
	});

	document.querySelectorAll('[data-player-name]').forEach((input) => {
		input.addEventListener('change', (event) => {
			const [teamId, playerId] = event.target.getAttribute('data-player-name').split(':');
			updateActiveEvent((current) => {
				const team = current.teams.find((item) => item.id === teamId);
				const player = team.players.find((item) => item.id === playerId);
				const playerNumber = getTeamPlayerNumber(team, player.id);
				player.name = event.target.value.trim() || getDefaultPlayerName(playerNumber - 1);
				return current;
			});
		});
	});

	document.querySelectorAll('[data-score]').forEach((input) => {
		input.addEventListener('change', (event) => {
			const [roundId, matchId, playerMatchId, side] = event.target
				.getAttribute('data-score')
				.split(':');
			const value = Number(event.target.value);
			updateActiveEvent((current) => {
				const round = current.rounds.find((item) => item.id === roundId);
				const match = round.matches.find((item) => item.id === matchId);
				const playerMatch = match.playerMatches.find((item) => item.id === playerMatchId);
				if (side === 'A') {
					playerMatch.winsA = value;
				} else if (side === 'D') {
					playerMatch.draws = value;
				} else {
					playerMatch.winsB = value;
				}
				if (
					!validatePlayerMatchScore(
						playerMatch.winsA,
						playerMatch.winsB,
						playerMatch.draws ?? 0
					)
				) {
					window.alert(
						'Each player match must have wins from 0 to 2, with wins + draws totaling between 0 and 3 games.'
					);
					if (side === 'A') {
						playerMatch.winsA = 0;
					} else if (side === 'D') {
						playerMatch.draws = 0;
					} else {
						playerMatch.winsB = 0;
					}
				}
				return current;
			});
		});
	});
}

render();
