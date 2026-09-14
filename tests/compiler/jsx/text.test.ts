import { createTestProject } from "../createTestProject";
import { expectSuccess, ReferenceFixture } from "../referenceFixture";

it("quotes decoded JSX text without changing backslashes or control characters", () => {
	const project = createTestProject();
	const output = project.compileSource(String.raw`
		declare namespace React {
			function createElement(tag: string, props: unknown, ...children: Array<string>): string;
			namespace JSX {
				type Element = string;
				interface IntrinsicElements { text: {} }
			}
		}
		export const value = <text>&quot;&apos;\path&#0;1&#9;&#10;&#13;&#127;&#x1f;</text>;
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("uses the default fragment factory for an empty JSX fragment", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { jsx: "react" });
		fixture.write(
			"game/src/fragment.tsx",
			`
			declare namespace React {
				function createElement(tag: unknown, props?: unknown): {};
				namespace JSX { type Element = {}; }
			}
			declare const Fragment: unique symbol;
			const element = <></>;
			print(element);
		`,
		);
		expectSuccess(fixture.createBuild().build());
		expect(fixture.read("out/game/fragment.luau")).toContain("React.createElement(Fragment)");
	} finally {
		fixture.close();
	}
});
