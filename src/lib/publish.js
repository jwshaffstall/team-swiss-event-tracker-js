import { calculateStandings } from './swiss.js';

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function teamLookup(event) {
	return new Map(event.teams.map((team) => [team.id, team]));
}

export function generatePublishedHtml(event) {
	const standings = calculateStandings(event);
	const teamsById = teamLookup(event);
	const standingsRows = standings
		.map(
			(row, index) => `<tr>
	<td>${index + 1}</td>
	<td>${escapeHtml(row.teamName)}</td>
	<td>${row.matchPoints}</td>
	<td>${row.matchWins}-${row.matchDraws}-${row.matchLosses}</td>
	<td>${row.buchholz.toFixed(2)}</td>
	<td>${(row.opponentMatchWinRate * 100).toFixed(1)}%</td>
	<td>${row.gamePoints}</td>
</tr>`
		)
		.join('\n');

	const roundsHtml = event.rounds
		.map((round) => {
			const matchesHtml = round.matches
				.map((match) => {
					const teamA = teamsById.get(match.teamAId);
					const teamB = teamsById.get(match.teamBId);
					const seatRows = match.playerMatches
						.map((pm) => {
							const aPlayer = teamA.players.find(
								(player) => player.id === pm.teamAPlayerId
							);
							const bPlayer = teamB.players.find(
								(player) => player.id === pm.teamBPlayerId
							);
							return `<tr><td>${pm.seat + 1}</td><td>${escapeHtml(aPlayer?.name ?? 'Unknown')}</td><td>${pm.winsA}</td><td>${pm.draws ?? 0}</td><td>${pm.winsB}</td><td>${escapeHtml(bPlayer?.name ?? 'Unknown')}</td></tr>`;
						})
						.join('');
					return `<article class="match"><h3>${escapeHtml(teamA.name)} vs ${escapeHtml(teamB.name)}</h3><table><thead><tr><th>Seat</th><th>${escapeHtml(teamA.name)}</th><th>Wins</th><th>Draws</th><th>Wins</th><th>${escapeHtml(teamB.name)}</th></tr></thead><tbody>${seatRows}</tbody></table></article>`;
				})
				.join('');
			return `<section><h2>Round ${round.roundNumber}</h2>${matchesHtml}</section>`;
		})
		.join('');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(event.name)} - Published Standings</title>
	<style>
		:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
		body { margin: 0; background: #0f172a; color: #e2e8f0; padding: 2rem; }
		h1,h2,h3 { margin: 0 0 0.75rem 0; }
		table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
		th, td { border: 1px solid #334155; padding: 0.45rem; text-align: left; }
		section, .panel { background: #111827; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
		.match { margin-bottom: 0.75rem; }
	</style>
</head>
<body>
	<header class="panel">
		<h1>${escapeHtml(event.name)}</h1>
		<p>Published ${new Date().toLocaleString()} • Teams: ${event.teams.length} • Players per team: ${event.playersPerTeam}</p>
	</header>
	<section>
		<h2>Standings</h2>
		<table>
			<thead><tr><th>#</th><th>Team</th><th>MP</th><th>W-D-L</th><th>Buchholz</th><th>OMW%</th><th>Game Pts</th></tr></thead>
			<tbody>${standingsRows}</tbody>
		</table>
	</section>
	${roundsHtml}
</body>
</html>`;
}

export function downloadPublishedHtml(event) {
	const html = generatePublishedHtml(event);
	const blob = new Blob([html], { type: 'text/html' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${event.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') || 'event'}-published.html`;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
