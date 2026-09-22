function pair() {
	return $tuple(50, 60);
}
const original = { 0: pair };
const widened: { [index: number]: () => LuaTuple<[number, number]> | undefined } = original;
