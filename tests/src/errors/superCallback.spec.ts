{
	let i = 0;
	new (class Boat extends class Goat {
		[key: number]: () => number;

		public q = (s: string) => {
			return s;
		};

		public f(s: string) {
			return s;
		}

		public [++i]() {
			return 1;
		}
	} {
		public f(s: string, b?: boolean) {
			print(super.f("Chicken"));
			print(super.q("Hen")); // should error here!
			super[i]();
			return "Rooster";
		}

		public q = () => {
			return "Rooster";
		};
	})().f("Go!");
}
export {};
