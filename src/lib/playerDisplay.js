/**
 * Normalizes free-form text input so downstream display helpers can operate on
 * trimmed strings without repeatedly handling nullish values.
 *
 * @param {unknown} value Raw value from user input or persisted event data.
 * @returns {string} A trimmed string representation of the provided value.
 */
function normalizeToken(value) {
	return String(value ?? '').trim();
}

/**
 * Builds a compact uppercase initialism for a team label.
 *
 * @param {string} teamName Team name entered by the user.
 * @returns {string} Uppercase initials, or `T` when the name is empty.
 */
export function getTeamInitials(teamName) {
	const tokens = normalizeToken(teamName)
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
	if (!tokens.length) {
		return 'T';
	}
	return tokens.map((token) => token[0].toUpperCase()).join('');
}

/**
 * Converts a zero-based index into spreadsheet-style alphabet labels.
 *
 * @param {number} index Zero-based player position.
 * @returns {string} Label such as `A`, `B`, `Z`, `AA`, and so on.
 */
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

/**
 * Generates the default visible label for a player slot.
 *
 * @param {number} index Zero-based seat index on the team.
 * @returns {string} Default name in the format `Player <Label>`.
 */
export function getDefaultPlayerName(index) {
	return `Player ${getAlphabetLabel(index)}`;
}

/**
 * Resolves a player's one-based team seat number.
 *
 * @param {{players: Array<{id: string}>}} team Team that owns the player.
 * @param {string} playerId Player identifier to search for.
 * @returns {number} One-based seat number or `0` when not found.
 */
export function getTeamPlayerNumber(team, playerId) {
	const index = team.players.findIndex((player) => player.id === playerId);
	return index >= 0 ? index + 1 : 0;
}

/**
 * Returns a clean player name, falling back to the generated default for that seat.
 *
 * @param {{players: Array<{id: string}>}} team Team data that contains seat order.
 * @param {{id: string, name: string}} player Player record to format.
 * @returns {string} User-entered name when present, otherwise the default seat label.
 */
export function getPlayerBaseName(team, player) {
	const playerNumber = getTeamPlayerNumber(team, player.id);
	const defaultName = getDefaultPlayerName(Math.max(0, playerNumber - 1));
	return normalizeToken(player.name) || defaultName;
}

/**
 * Formats the fully-qualified display name shown throughout the UI.
 *
 * @param {{name: string, players: Array<{id: string}>}} team Team metadata.
 * @param {{id: string, name: string}} player Player to render.
 * @returns {string} Label in the format `<TEAM_INITIALS>-<seat> <player name>`.
 */
export function formatPlayerDisplayName(team, player) {
	const initials = getTeamInitials(team.name);
	const playerNumber = getTeamPlayerNumber(team, player.id);
	const baseName = getPlayerBaseName(team, player);
	return `${initials}-${playerNumber} ${baseName}`;
}
