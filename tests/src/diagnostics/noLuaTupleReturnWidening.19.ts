function pair() {
	return $tuple(50, 60);
}
function run(callback: (() => LuaTuple<[number, number]>) | (() => LuaTuple<[number, number]> | undefined)) {}
run(() => pair());
