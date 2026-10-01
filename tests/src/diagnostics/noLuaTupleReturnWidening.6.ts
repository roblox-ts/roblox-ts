function pair() {
	return $tuple(50, 60);
}
function absent(): undefined {
	return undefined;
}
function check(callback: typeof pair | typeof absent | undefined) {
	const value = callback?.();
	assert(value !== undefined && value[1] === 60);
}
