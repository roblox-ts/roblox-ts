export function getSafeBracketEquals(str: string) {
	let amtEquals = 0;

	if (str.endsWith("]")) {
		amtEquals++;
	}

	while (str.includes(`]${"=".repeat(amtEquals)}]`)) {
		amtEquals++;
	}
	return "=".repeat(amtEquals);
}
