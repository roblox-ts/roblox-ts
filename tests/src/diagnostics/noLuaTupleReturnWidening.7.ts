function pair() {
	return $tuple(50, 60);
}
const original = [pair];
const widened: Array<() => LuaTuple<[number, number]> | undefined> = original;
