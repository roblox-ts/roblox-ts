function pair() {
	return $tuple(50, 60);
}
const callback = pair as () => LuaTuple<[number, number]> | undefined;
