import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

jest.setTimeout(30000);

it.each([
	{ declaration: "export default function named() {}", value: "named" },
	{ declaration: "export default hidden;", value: "default" },
])("maps synthesized exports for $declaration to their declarations", ({ declaration, value }) => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		const source = `export let mutable = 1;
export const direct = 2;
const hidden = 3;
export { hidden as renamed };
${declaration}
export declare const ignored: number;
namespace Sample {
    export const nested = 4;
}
`;
		fixture.write("game/src/index.ts", source);
		expectSuccess(fixture.createBuild().build());
		const output = fixture.read("out/game/init.luau").split("\n");
		const map = new TraceMap(fixture.read("out/game/init.luau.map"));
		for (const expectation of [
			{ text: "exports.direct = direct", line: 2, column: 0 },
			{ text: "exports.renamed = hidden", line: 4, column: 9 },
			{ text: `exports.default = ${value}`, line: 5, column: 0 },
			{ text: "_container.nested = nested", line: 8, column: 4 },
		]) {
			expect(output).toContainEqual(expect.stringContaining(expectation.text));
			const line = output.findIndex(line => line.includes(expectation.text)) + 1;
			expect(line).toBeGreaterThan(0);
			expect(originalPositionFor(map, { line, column: 0 })).toMatchObject({
				line: expectation.line,
				column: expectation.column,
			});
		}
		expect(map.sourcesContent).toEqual([source]);
	} finally {
		fixture.close();
	}
});
