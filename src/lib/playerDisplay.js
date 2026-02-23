function normalizeToken(value) {
	return String(value ?? '').trim();
}

export function getTeamInitials(teamName) {
	const tokens = normalizeToken(teamName)
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
	if (!tokens.length) {
		return 'T';
	}
	return tokens.map((token) => token[0].toUpperCase()).join('');
}

export function getAlphabetLabel(index) {
	if (!Number.isInteger(index) || index < 0) {
		return 'A';
	}
	let value = index;
	let label = '';
	do {
		label = String.fromCharCode(65 + (value % 26)) + label;
		value = Math.floor(value / 26) - 1;
	} while (value >= 0);
	return label;
}

export function getDefaultPlayerName(index) {
	return `Player ${getAlphabetLabel(index)}`;
}

export function getTeamPlayerNumber(team, playerId) {
	const index = team.players.findIndex((player) => player.id === playerId);
	return index >= 0 ? index + 1 : 0;
}

export function getPlayerBaseName(team, player) {
	const playerNumber = getTeamPlayerNumber(team, player.id);
	const defaultName = getDefaultPlayerName(Math.max(0, playerNumber - 1));
	return normalizeToken(player.name) || defaultName;
}

export function formatPlayerDisplayName(team, player) {
	const initials = getTeamInitials(team.name);
	const playerNumber = getTeamPlayerNumber(team, player.id);
	const baseName = getPlayerBaseName(team, player);
	return `${initials}-${playerNumber} ${baseName}`;
}
