function pair() {
	return $tuple(50, 60);
}
function run(callback: (produce: () => LuaTuple<[number, number]>) => void) {
	callback(pair);
}
run((produce: () => LuaTuple<[number, number]> | undefined) => {});
