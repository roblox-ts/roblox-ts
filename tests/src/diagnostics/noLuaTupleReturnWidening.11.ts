function pair() {
	return $tuple(50, 60);
}
function maybe(): LuaTuple<[number, number]> | undefined {
	return pair();
}
function check(callback: typeof pair | typeof maybe) {
	return callback();
}
