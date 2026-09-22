import { createTestProject } from "./createTestProject";

it("boxes tuple branches of nullable return signatures", () => {
	expect(
		createTestProject().compileSource(`
			declare function pair(): LuaTuple<[number, number]>;
			export function macro(enabled: boolean): LuaTuple<[number, number]> | undefined {
				if (enabled) { return $tuple(50, 60); }
				return undefined;
			}
			export function call(enabled: boolean): LuaTuple<[number, number]> | undefined {
				if (enabled) { return pair(); }
				return undefined;
			}
		`),
	).toMatchSnapshot();
});

it("keeps nullable tuple forwarding and narrowed indexing scalar", () => {
	expect(
		createTestProject().compileSource(`
			function used(values: Array<LuaTuple<[number, number]>> | undefined) {
				return values?.shift();
			}
			declare const values: Array<LuaTuple<[number, number]>>;
			export const result = used(values);
			export const missing = used(undefined);
			export const second = used(values)![1];
		`),
	).toMatchSnapshot();
});

it("preserves multiple values inside optional call return branches", () => {
	expect(
		createTestProject().compileSource(`
			export function forward(callback: (() => LuaTuple<[number, number]>) | undefined) {
				return callback?.();
			}
		`),
	).toMatchSnapshot();
});

it("boxes unannotated callbacks in nullable tuple contexts", () => {
	expect(
		createTestProject().compileSource(`
			declare function pair(): LuaTuple<[number, number]>;
			declare function run(callback: () => LuaTuple<[number, number]> | undefined): LuaTuple<[number, number]> | undefined;
			print(run(() => pair()));
		`),
	).toMatchSnapshot();
});
