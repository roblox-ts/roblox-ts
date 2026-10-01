function pair() {
	return $tuple(50, 60);
}
const original = { nested: { callback: pair } };
function consume(value: { nested: { callback: () => LuaTuple<[number, number]> | undefined } }) {}
consume(original);
