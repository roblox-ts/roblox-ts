{
	new (class Boat extends class Goat {
		[key: number]: () => number;
	} {
		[i]() {
			return 10;
		}
		public f(s: string, b?: boolean) {
			this[i]();
		}
	})().f("Go!");
}
export {};
