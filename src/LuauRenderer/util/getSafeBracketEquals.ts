export function getSafeBracketEquals(str: string) {
	let amtEquals = 0;
	while (str.includes(`]${"=".repeat(amtEquals)}]`) || str.endsWith(`]${"=".repeat(amtEquals)}`)) {
		amtEquals++;
	}
	return "=".repeat(amtEquals);
}
