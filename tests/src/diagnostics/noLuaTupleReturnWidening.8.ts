function pair() {
	return $tuple(50, 60);
}
const original = { callback: pair };
const widened: { [name: string]: () => LuaTuple<[number, number]> | undefined } = original;
