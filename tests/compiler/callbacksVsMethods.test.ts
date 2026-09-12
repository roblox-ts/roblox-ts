import { createTestProject } from "./createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it.each([
	{
		name: "class declarations honor explicit receivers",
		source: `
			class Example {
				value = 10;
				callback(this: void, value: number) { return value; }
				method(this: Example, value: number) { return this.value + value; }
				static staticCallback(this: void, value: number) { return value; }
				static staticMethod(this: typeof Example, value: number) { return this.staticCallback(value); }
			}
			const object = new Example();
			object.callback(123);
			object.method(123);
			Example.staticCallback(123);
			Example.staticMethod(123);
		`,
	},
	{
		name: "direct calls distinguish void and optional receivers",
		source: `
			type Callable<T> = (this: T, value: number) => number;
			function original(value: number) { return value + 1; }
			const assigned: Callable<void> = original;
			assigned(41);
			const callback: Callable<void> = value => value + 1;
			callback(41);
			const optional: Callable<void> | undefined = (() => callback)();
			optional?.(41);
			function method(this: defined | void, value: number) { return value + 1; }
			method(41);
		`,
	},
	{
		name: "documented non-void this overrides a callback signature",
		source: `
			declare const object: {
				foo: (this: typeof object, value: number) => void;
			};
			object.foo(123);
		`,
	},
	{
		name: "documented void this overrides a method declaration",
		source: `
			const object = {
				foo(this: void, value: number) { return value; },
			};
			object.foo(123);
		`,
	},
	{
		name: "function declarations and expressions honor explicit receivers",
		source: `
			type Receiver = { value: number };
			function callback(this: void, value: number) { return value; }
			function method(this: Receiver, value: number) { return this.value + value; }
			const callbackExpression = function(this: void, value: number) { return value; };
			const methodExpression = function(this: Receiver, value: number) { return this.value + value; };
			const object = { value: 10, callback, method, callbackExpression, methodExpression };
			object.callback(123);
			object.method(123);
			object.callbackExpression(123);
			object.methodExpression(123);
		`,
	},
	{
		name: "generic callback aliases keep their receiver after instantiation",
		source: `
			type Callable<T> = (this: T, value: number) => number;
			function make<T extends defined>() {
				const callback: Callable<T> = value => value + 1;
				return { callback };
			}
			const object = make<defined>();
			object.callback(41);
		`,
	},
	{
		name: "generic classes keep their receiver after instantiation",
		source: `
			class Example<T extends defined> {
				method(this: T, value: number) { return value + 1; }
			}
			const object = new Example<defined>();
			object.method(41);
			object["method"](41);
			object.method?.(41);
			const optional: typeof object | undefined = (() => object)();
			optional?.method(41);
		`,
	},
	{
		name: "generic factories keep their receivers after instantiation",
		source: `
			function make<T extends defined>() {
				const callback: (this: T, value: number) => number = value => value + 1;
				return {
					callback,
					method(this: T, value: number) { return value + 1; },
				};
			}
			const object = make<defined>();
			object.callback(41);
			object.method(41);
		`,
	},
	{
		name: "generic receiver instantiations stay distinct when the callback comes first",
		source: `
			type Callable<T> = (this: T, value: number) => number;
			declare const object: { callback: Callable<void>; method: Callable<{ value: number }>; value: number };
			object.callback(123);
			object.method(123);
		`,
	},
	{
		name: "generic receiver instantiations stay distinct when the method comes first",
		source: `
			type Callable<T> = (this: T, value: number) => number;
			declare const object: { callback: Callable<void>; method: Callable<{ value: number }>; value: number };
			object.method(123);
			object.callback(123);
		`,
	},
	{
		name: "instantiated interface signatures honor explicit receivers",
		source: `
			interface API<T> {
				callback(this: void, value: T): T;
				method: (this: API<T>, value: T) => T;
			}
			declare const numbers: API<number>;
			declare const strings: API<string>;
			numbers.callback(123);
			numbers.method(123);
			strings.callback("value");
			strings.method("value");
		`,
	},
	{
		name: "object literal declarations and expressions honor explicit receivers",
		source: `
			type Receiver = { value: number };
			const object = {
				value: 10,
				callback(this: void, value: number) { return value; },
				method(this: Receiver, value: number) { return this.value + value; },
				callbackExpression: function(this: void, value: number) { return value; },
				methodExpression: function(this: Receiver, value: number) { return this.value + value; },
			};
			object.callback(123);
			object.method(123);
			object.callbackExpression(123);
			object.methodExpression(123);
		`,
	},
	{
		name: "optional and indexed calls honor explicit receivers",
		source: `
			interface API {
				callback(this: void, value: number): void;
				method: (this: API, value: number) => void;
			}
			declare const object: API;
			declare const optional: API | undefined;
			declare const callbackKey: "callback";
			declare const methodKey: "method";
			object[callbackKey](123);
			object[methodKey](123);
			optional?.callback(123);
			optional?.method(123);
		`,
	},
	{
		name: "synthetic callback signatures from evolving arrays have no receiver",
		declarations: "interface Array<T> { push<U>(callback: () => (value: number) => U): number; }",
		source: `
			const callbacks = [];
			callbacks.push(() => value => value);
			const object = { callback: callbacks[0] };
			const callback = object.callback() as (value: number) => number;
			assert(callback(123) === 123);
		`,
	},
])("$name", ({ source, declarations }) => {
	const project = createTestProject();
	if (declarations) {
		project.vfs.writeFile("/src/augmentation.d.ts", declarations);
	}
	const output = project.compileSource(source);
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
