import { downloadPublishedHtml } from './lib/publish.js';
import { loadState, saveState } from './lib/storage.js';
import {
	calculateStandings,
	createEvent,
	generateNextRound,
	validatePlayerMatchScore,
} from './lib/swiss.js';

const app = document.querySelector('#app');
const state = loadState();

if (!state.events.length) {
	state.events.push(createEvent({ name: 'Sample Event', teamCount: 4, playersPerTeam: 3 }));
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
			.map(
				(player) =>
					`<li><input data-player-name="${team.id}:${player.id}" value="${player.name}" /></li>`
			)
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
							const playerA = teamA.players.find((player) => player.id === pm.teamAPlayerId);
							const playerB = teamB.players.find((player) => player.id === pm.teamBPlayerId);
							return `<tr>
		<td>${pm.seat + 1}</td>
		<td>${playerA?.name ?? 'Unknown'}</td>
		<td><input type="number" min="0" max="2" data-score="${round.id}:${match.id}:${pm.id}:A" value="${pm.winsA}" /></td>
		<td><input type="number" min="0" max="3" data-score="${round.id}:${match.id}:${pm.id}:D" value="${pm.draws ?? 0}" /></td>
		<td><input type="number" min="0" max="2" data-score="${round.id}:${match.id}:${pm.id}:B" value="${pm.winsB}" /></td>
		<td>${playerB?.name ?? 'Unknown'}</td>
	</tr>`;
						})
						.join('');
					return `<article class="card"><h3>${teamA.name} vs ${teamB.name}</h3>
	<table><thead><tr><th>Seat</th><th>${teamA.name}</th><th>Wins</th><th>Draws</th><th>Wins</th><th>${teamB.name}</th></tr></thead><tbody>${seatRows}</tbody></table>
</article>`;
				})
				.join('');
			return `<section><h2>Round ${round.roundNumber}</h2>${matches}</section>`;
		})
		.join('');
}

function renderStandings(event) {
	const standings = calculateStandings(event);
	const rows = standings
		.map(
			(row, index) => `<tr>
	<td>${index + 1}</td><td>${row.teamName}</td><td>${row.matchPoints}</td><td>${row.matchWins}-${row.matchDraws}-${row.matchLosses}</td>
	<td>${row.buchholz.toFixed(2)}</td><td>${(row.opponentMatchWinRate * 100).toFixed(1)}%</td><td>${row.gamePoints}</td></tr>`
		)
		.join('');
	return `<table><thead><tr><th>#</th><th>Team</th><th>MP</th><th>W-D-L</th><th>Buchholz</th><th>OMW%</th><th>Game Pts</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function render() {
	const activeEvent = getActiveEvent();
	if (!activeEvent) {
		app.innerHTML = '<p>No events found.</p>';
		return;
	}

	app.innerHTML = `<main>
	<header class="top-row">
		<h1>Team Swiss Tracker</h1>
		${renderEventSelector(activeEvent)}
	</header>
	<section class="toolbar card">
		<label>New event name <input id="new-event-name" placeholder="Weekend League" /></label>
		<label>Teams <input id="new-event-teams" type="number" min="2" step="2" value="4" /></label>
		<label>Players / team <input id="new-event-players" type="number" min="1" value="3" /></label>
		<button id="create-event">Create Event</button>
		<button id="delete-event" class="danger">Delete Active Event</button>
		<button id="next-round">Generate Next Round</button>
		<button id="publish-event">Publish HTML Snapshot</button>
	</section>
	<section class="card">
		<h2>Teams & Players</h2>
		<div class="teams-grid">${renderTeamEditor(activeEvent)}</div>
	</section>
	<section class="card">
		<h2>Standings</h2>
		${renderStandings(activeEvent)}
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
		persistAndRender();
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
		persistAndRender();
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
			updateActiveEvent((event) => generateNextRound(event));
		} catch (error) {
			window.alert(error instanceof Error ? error.message : 'Unable to create next round.');
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
				player.name = event.target.value.trim() || player.name;
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
