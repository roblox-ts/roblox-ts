import { createTestProject } from "../createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it("inlines a single aliased assignment", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value: number };
		let alias: number;
		({ value: alias } = receiver());
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("inlines a single aliased binding", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value: number };
		const { value: alias } = receiver();
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("inlines a single service property assignment", () => {
	const output = createTestProject()
		.compileSource('let Terrain: Terrain; ({ Terrain } = game.GetService("Workspace"));')
		.replace(/^-- Compiled with.*\n/, "");

	expect(output).toContain('Terrain = game:GetService("Workspace").Terrain');
	expect(output).toMatchSnapshot();
});

it("inlines a single service property binding", () => {
	const output = createTestProject()
		.compileSource('const { Terrain } = game.GetService("Workspace");')
		.replace(/^-- Compiled with.*\n/, "");

	expect(output).toContain('local Terrain = game:GetService("Workspace").Terrain');
	expect(output).toMatchSnapshot();
});

it.each(["value", "value: alias"])("keeps a single assignment default after the property read (%s)", target => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value?: number };
		declare function fallback(): number;
		let value: number;
		let alias: number;
		({ ${target} = fallback() } = receiver());
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("keeps a single binding default after the property read", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value?: number };
		declare function fallback(): number;
		const { value = fallback() } = receiver();
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it.each([
	["computed keys", "({ [key++]: value } = receiver());"],
	["indexed targets", "({ value: target()[key++] } = receiver());"],
	["multiple properties", "({ value, other } = receiver());"],
	["nested patterns", "({ nested: { value } } = receiver());"],
	["property targets", "({ value: target().value } = receiver());"],
	["rest assignments", "({ ...rest } = receiver());"],
])("keeps assignment receiver captures for %s", (_name, source) => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { [index: number]: number; value: number; other: number; nested: { value: number } };
		declare function target(): { [index: number]: number; value: number };
		let value: number;
		let other: number;
		let rest: object;
		let key = 0;
		${source}
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it.each([
	["computed keys", "const { [key++]: value } = receiver();"],
	["multiple bindings", "const { first, second } = receiver();"],
	["nested bindings", "const { nested: { value } } = receiver();"],
	["numeric keys", "const { 0: value } = receiver();"],
	["rest bindings", "const { ...rest } = receiver();"],
	["string keys", 'const { "first": value } = receiver();'],
])("keeps receiver captures for %s", (_name, source) => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { [index: number]: number; first: number; second: number; nested: { value: number } };
		let key = 0;
		${source}
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("keeps the receiver when the assignment result is used", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value: number };
		let value: number;
		const result = ({ value } = receiver());
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("parenthesizes a literal assignment receiver", () => {
	const output = createTestProject().compileSource("let value: number; ({ value } = { value: 42 });");

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("parenthesizes a literal receiver", () => {
	const output = createTestProject().compileSource("const { value } = { value: 42 };");

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("preserves assignment receiver prerequisites", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(count: number): { value: number };
		let count = 0;
		let value: number;
		({ value } = receiver(count++));
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("preserves mutable exports and their assignment defaults", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value?: number };
		export let value = 0;
		({ value = 42 } = receiver());
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("preserves mutable exports and their defaults", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(): { value?: number };
		export let { value = 42 } = receiver();
		value++;
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("preserves receiver prerequisites", () => {
	const output = createTestProject().compileSource(`
		declare function receiver(value: number): { value: number };
		let count = 0;
		const { value } = receiver(count++);
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
