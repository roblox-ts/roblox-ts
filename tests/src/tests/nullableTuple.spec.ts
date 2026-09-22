export = () => {
	function pair() {
		return $tuple(50, 60);
	}

	it("should preserve stored nullable tuple identity and absence", () => {
		function forward(value: LuaTuple<[number, number]> | undefined) {
			return value;
		}
		function remove(values: Array<LuaTuple<[number, number]>> | undefined) {
			return values?.shift();
		}

		const value = pair();
		expect(forward(value)).to.equal(value);
		expect(forward(undefined)).to.equal(undefined);
		expect(remove([value])).to.equal(value);
		expect(remove(undefined)).to.equal(undefined);
	});

	it("should box tuple branches of nullable return signatures", () => {
		function macro(enabled: boolean): LuaTuple<[number, number]> | undefined {
			if (enabled) {
				return $tuple(50, 60);
			}
			return undefined;
		}
		function call(enabled: boolean): LuaTuple<[number, number]> | undefined {
			if (enabled) {
				return pair();
			}
			return undefined;
		}
		function stored(enabled: boolean): LuaTuple<[number, number]> | undefined {
			if (enabled) {
				const value = pair();
				return value;
			}
			return undefined;
		}

		for (const callback of [macro, call, stored]) {
			const value = callback(true);
			expect(value?.[0]).to.equal(50);
			expect(value?.[1]).to.equal(60);
			expect(callback(false)).to.equal(undefined);
		}
	});

	it("should preserve pure tuple optional calls through returns", () => {
		function forward(callback: typeof pair | undefined) {
			return callback?.();
		}
		const arrow = (callback: typeof pair | undefined) => callback?.();
		for (const callback of [forward, arrow]) {
			const value = callback(pair);
			expect(value?.[0]).to.equal(50);
			expect(value?.[1]).to.equal(60);
			expect(callback(undefined)).to.equal(undefined);
		}
	});

	it("should keep narrowed nullable call results scalar", () => {
		function maybe(): LuaTuple<[number, number]> | undefined {
			return pair();
		}
		function forward() {
			return maybe()!;
		}
		function sum(...values: Array<number>) {
			return values[0] + values[1];
		}

		expect(maybe()![0]).to.equal(50);
		expect(maybe()![1]).to.equal(60);
		const [a, b] = maybe()!;
		expect(a).to.equal(50);
		expect(b).to.equal(60);
		let x = 0;
		let y = 0;
		[x, y] = maybe()!;
		expect(x).to.equal(50);
		expect(y).to.equal(60);
		const [first, ...rest] = maybe()!;
		expect(first).to.equal(50);
		expect(rest[0]).to.equal(60);
		expect(sum(...maybe()!)).to.equal(110);
		const forwarded = forward();
		expect(forwarded[0]).to.equal(50);
		expect(forwarded[1]).to.equal(60);
	});

	it("should distinguish empty and nil-containing tuples from absence", () => {
		function empty(enabled: boolean): LuaTuple<[]> | undefined {
			if (enabled) {
				return $tuple();
			}
			return undefined;
		}
		function holes(enabled: boolean): LuaTuple<[undefined, number, undefined]> | undefined {
			if (enabled) {
				return $tuple(undefined, 60, undefined);
			}
			return undefined;
		}

		expect(empty(true) !== undefined).to.equal(true);
		expect(empty(false)).to.equal(undefined);
		const value = holes(true);
		expect(value !== undefined).to.equal(true);
		expect(value?.[0]).to.equal(undefined);
		expect(value?.[1]).to.equal(60);
		expect(value?.[2]).to.equal(undefined);
		expect(holes(false)).to.equal(undefined);
	});

	it("should preserve nullable tuples through try and finally", () => {
		let finalized = 0;
		function forward(value: LuaTuple<[number, number]> | undefined) {
			try {
				return value;
			} finally {
				finalized++;
			}
		}

		const value = pair();
		expect(forward(value)).to.equal(value);
		expect(forward(undefined)).to.equal(undefined);
		expect(finalized).to.equal(2);
	});

	it("should execute discarded nullable calls", () => {
		let calls = 0;
		function maybe(): LuaTuple<[number, number]> | undefined {
			calls++;
			return pair();
		}
		function discard(callback: typeof maybe | undefined) {
			callback?.();
		}

		maybe();
		discard(maybe);
		discard(undefined);
		expect(calls).to.equal(2);
	});

	it("should adapt callbacks with explicitly nullable return wrappers", () => {
		const callback: () => LuaTuple<[number, number]> | undefined = (): LuaTuple<[number, number]> | undefined =>
			pair();
		const value = callback();
		expect(value?.[0]).to.equal(50);
		expect(value?.[1]).to.equal(60);
	});

	it("should box unannotated callbacks with nullable tuple contexts", () => {
		type Pair = LuaTuple<[number, number]>;
		function run(callback: () => Pair | undefined) {
			return callback();
		}
		const container: { callback: () => Pair | undefined } = { callback: () => pair() };
		const callbacks: Array<() => Pair | undefined> = [() => $tuple(50, 60)];

		for (const value of [
			run(() => pair()),
			run(function () {
				return pair();
			}),
			container.callback(),
			callbacks[0](),
		]) {
			expect(value?.[0]).to.equal(50);
			expect(value?.[1]).to.equal(60);
		}

		// without a nullable context, the callback keeps multiple returns
		const produce = () => pair();
		const [first, second] = produce();
		expect(first).to.equal(50);
		expect(second).to.equal(60);
	});

	it("should preserve compatible callback containers", () => {
		type Pair = LuaTuple<[number, number]>;
		const callback = (): Pair | undefined => pair();
		const original = { nested: { callback }, extra: true };
		const container: { nested: { callback?: () => Pair | undefined } } = original;
		expect(container.nested.callback?.()?.[1]).to.equal(60);

		const callbacks = [callback];
		const readonlyCallbacks: ReadonlyArray<() => Pair | undefined> = callbacks;
		expect(readonlyCallbacks[0]()?.[1]).to.equal(60);

		const tuples = [pair()];
		const optionalTuples: ReadonlyArray<Pair | undefined> = tuples;
		expect(optionalTuples[0]?.[1]).to.equal(60);

		const entries = { callback };
		const dictionary: { [name: string]: () => Pair | undefined } = entries;
		expect(dictionary.callback()?.[1]).to.equal(60);

		interface Original {
			next?: Original;
			callback: () => Pair | undefined;
			extra: boolean;
		}
		interface Target {
			next?: Target;
			callback: () => Pair | undefined;
		}
		const recursive: Original = { callback, extra: true };
		recursive.next = recursive;
		const widened: Target = recursive;
		expect(widened.next?.callback()?.[1]).to.equal(60);
	});

	it("should preserve compatible callable unions and discriminated containers", () => {
		type Pair = LuaTuple<[number, number]>;
		function other() {
			return $tuple(70, 80);
		}
		function nullable(): Pair | undefined {
			return pair();
		}
		function absent(): undefined {
			return undefined;
		}
		function pure(callback: typeof pair | typeof other) {
			return callback()[1];
		}
		function optional(callback: typeof pair | typeof other | undefined) {
			return callback?.()?.[1];
		}
		function maybe(callback: typeof nullable | typeof absent) {
			return callback()?.[1];
		}

		expect(pure(pair)).to.equal(60);
		expect(pure(other)).to.equal(80);
		expect(optional(pair)).to.equal(60);
		expect(optional(other)).to.equal(80);
		expect(optional(undefined)).to.equal(undefined);
		expect(maybe(nullable)).to.equal(60);
		expect(maybe(absent)).to.equal(undefined);

		type Container =
			{ kind: "pure"; callback: () => Pair } | { kind: "nullable"; callback: () => Pair | undefined };
		const original = { kind: "pure" as const, callback: pair };
		const container: Container = original;
		function read(value: Container) {
			if (value.kind === "pure") {
				return value.callback()[1];
			}
			return value.callback()?.[1];
		}
		expect(read(container)).to.equal(60);
		expect(read({ kind: "nullable", callback: nullable })).to.equal(60);
	});

	it("should preserve optional generic and overloaded tuple calls", () => {
		function generic<T>(value: T): LuaTuple<[T, T]> {
			return $tuple(value, value);
		}
		function overloaded(value: number): LuaTuple<[number, number]>;
		function overloaded(value: string): LuaTuple<[string, string]>;
		function overloaded(value: number | string): LuaTuple<[number | string, number | string]> {
			return $tuple(value, value);
		}
		function check(first: typeof generic | undefined, second: typeof overloaded | undefined) {
			const a = first?.(50);
			const b = second?.("value");
			expect(a?.[1]).to.equal(first ? 50 : undefined);
			expect(b?.[1]).to.equal(second ? "value" : undefined);
		}

		check(generic, overloaded);
		check(undefined, undefined);
	});

	it("should preserve optional nullable calls and effectful indices", () => {
		let calls = 0;
		function maybe(): LuaTuple<[number, number]> | undefined {
			calls++;
			return pair();
		}
		function check(callback: typeof maybe | undefined) {
			const value = callback?.();
			expect(value?.[1]).to.equal(callback ? 60 : undefined);
		}
		let indices = 0;
		function index() {
			indices++;
			return 1;
		}

		check(maybe);
		check(undefined);
		expect(maybe()![index()]).to.equal(60);
		expect(calls).to.equal(2);
		expect(indices).to.equal(1);
	});

	it("should box reducer callbacks inside optional receiver branches", () => {
		function reduce(values: Array<LuaTuple<[number, number]>> | undefined) {
			return values?.reduce(previous => previous);
		}
		const value = reduce([pair(), pair()]);
		expect(value?.[0]).to.equal(50);
		expect(value?.[1]).to.equal(60);
		expect(reduce(undefined)).to.equal(undefined);
	});

	it("should retain scalar nullable reducer results", () => {
		const value = pair();
		const result = [1, 2].reduce<LuaTuple<[number, number]> | undefined>((previous, current) => {
			return current === 1 ? value : previous;
		}, undefined);
		expect(result).to.equal(value);
		const narrowed = [1, 2].reduce<LuaTuple<[number, number]> | undefined>(
			(): LuaTuple<[number, number]> | undefined => value,
			undefined,
		)!;
		expect(narrowed).to.equal(value);
		const missing = [1, 2].reduce<LuaTuple<[number, number]> | undefined>(() => undefined, undefined);
		expect(missing).to.equal(undefined);
	});
};
