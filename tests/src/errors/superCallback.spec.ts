{
	new (class Boat extends class Goat {
		public q = (s: string) => {
			return s;
		};
	} {
		public f(s: string, b?: boolean) {
			print(super.q("Hen")); // should error here!
		}
	})().f("Go!");
}
export {};
