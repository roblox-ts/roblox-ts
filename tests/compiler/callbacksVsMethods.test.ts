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
])("$name", ({ source }) => {
	const project = createTestProject();
	const output = project.compileSource(source);
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
