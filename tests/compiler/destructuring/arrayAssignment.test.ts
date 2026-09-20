import { createTestProject } from "../createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it("captures array values before destination prerequisites", () => {
	const output = createTestProject().compileSource(`
		declare function target(): { value: string };
		declare let separator: string;
		[target().value] = [["a", "b"].join(separator)];
	`);

	expect(output).toMatchSnapshot();
});

it("captures tuple returns before destination prerequisites", () => {
	const output = createTestProject().compileSource(`
		declare function target(): { value: number };
		declare function values(): LuaTuple<[number, number, number]>;
		let last: number;
		[target().value, , last] = values();
	`);

	expect(output).toMatchSnapshot();
});

it("captures wrapped tuple returns without dropping omitted positions", () => {
	const output = createTestProject().compileSource(`
		declare function target(): { value: number };
		declare function values(): LuaTuple<[number, undefined, number]>;
		let last: number;
		[target().value, , last] = identity<[number, undefined, number]>(values());
	`);

	expect(output).toMatchSnapshot();
});

it("keeps independent literal values inline", () => {
	const output = createTestProject().compileSource(`
		declare function target(): { value: number };
		let other: number;
		[target().value, other] = [1, 2];
	`);

	expect(output).toMatchSnapshot();
});

it("keeps simple tuple assignments inline", () => {
	const output = createTestProject().compileSource(`
		declare function values(): LuaTuple<[number, number]>;
		let first: number;
		let second: number;
		[first, second] = values();
	`);

	expect(output).toMatchSnapshot();
});
