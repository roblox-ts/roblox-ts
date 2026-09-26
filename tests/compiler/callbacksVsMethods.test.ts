import { errors, getDiagnosticId } from "Shared/diagnostics";
import { DiagnosticError } from "Shared/errors/DiagnosticError";

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
		name: "direct calls honor instantiated void receivers",
		source: `
			type Callable<T> = (this: T, value: number) => number;
			function original(value: number) { return value + 1; }
			const assigned: Callable<void> = original;
			assigned(41);
			const callback: Callable<void> = value => value + 1;
			callback(41);
			const optional: Callable<void> | undefined = (() => callback)();
			optional?.(41);
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
	{
		name: "super calls distinguish callbacks and methods",
		source: `
			declare class Base {
				static callback: (this: void, value: number) => number;
				static method(value: number): number;
			}
			class Derived extends Base {
				static run() {
					super.callback(41);
					super["callback"](41);
					super.method(41);
					super["method"](41);
				}
			}
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
	{
		name: "zero-parameter arrow literals ignore method receivers without adding parameters",
		source: `
			declare const mock: { mockImplementation(callback: (this: defined) => never): void };
			mock.mockImplementation(() => { throw "rate-limited"; });
			const object: { method(value: number): number } = { method: (() => 42) };
			object.method(100);
			const callback: (this: defined | void, value: number) => number = (() => 43);
			callback(100);
		`,
	},
	{
		name: "zero-parameter function references ignore method receivers without wrappers",
		source: `
			declare function accept(callback: (this: defined, value: number) => number): void;
			function declared() { return 40; }
			const arrow = () => 41;
			const expression = function() { return 42; };
			accept(declared);
			accept(arrow);
			accept(expression);
			accept(function() { return 43; } satisfies () => number);
			accept(function(this: void) { return 44; });
			const object: { declared(): number; arrow(): number; expression(): number } = {
				declared, arrow, expression,
			};
			object.declared();
			object.arrow();
			object.expression();
		`,
	},
])("$name", ({ source, declarations }) => {
	const project = createTestProject();
	if (declarations) {
		project.vfs.writeFile("/src/augmentation.d.ts", declarations);
	}
	const output = project.compileSource(source);
	expect(output).toMatchSnapshot();
});

it("rejects callable assertions on implicit arguments without an implementation", () => {
	expect.assertions(2);

	try {
		createTestProject().compileSource(`
			declare function accept(callback: (this: defined) => number): void;
			function forward() {
				accept(arguments as unknown as () => number);
			}
		`);
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (error instanceof DiagnosticError) {
			expect(error.diagnostics.map(getDiagnosticId)).toEqual([
				errors.noArguments.id,
				errors.expectedMethodGotFunction.id,
			]);
		}
	}
});
