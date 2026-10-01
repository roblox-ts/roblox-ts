function pair() {
	return $tuple(50, 60);
}
function makePair() {
	return pair;
}
const make: () => () => LuaTuple<[number, number]> | undefined = makePair;
