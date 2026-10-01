function pair() {
	return $tuple(50, 60);
}
const callback: (() => LuaTuple<[number, number]> | undefined) | undefined = pair;
