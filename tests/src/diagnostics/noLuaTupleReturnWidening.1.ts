function maybe(enabled: true): LuaTuple<[number, number]>;
function maybe(enabled: false): LuaTuple<[number, number]> | undefined;
function maybe(enabled: boolean): LuaTuple<[number, number]> | undefined {
	if (enabled) {
		return $tuple(50, 60);
	}
	return undefined;
}
maybe(true);
