function pair() {
	return $tuple(50, 60);
}
const original = { callback: pair };
const widened: { callback: () => LuaTuple<[number, number]> | undefined } = original;
const value = widened.callback();
assert(value !== undefined && value[0] === 50 && value[1] === 60);
