import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

import { createTestProject } from "../createTestProject";

afterEach(() => DiagnosticService.flush());

it.each([
	["with ({}) {}", "Unknown statement: WithStatement"],
	["const value = import.meta;", "Unknown expression: MetaProperty"],
	["({ value: 42 } = { value: 1 });", "transformObjectAssignmentPattern invalid initializer: NumericLiteral"],
	["({ method() {} } = {});", "transformObjectAssignmentPattern invalid property: MethodDeclaration"],
	["[42] = (() => [1])();", "transformArrayAssignmentPattern invalid element: NumericLiteral"],
	["const { ...a, ...b } = {};", "Unknown expression type"],
	["const [value] = 42;", "Destructuring not supported for type: 42"],
])("rejects unsupported source after semantic checks are disabled: %s", (source, message) => {
	const project = createTestProject({ allowCommentDirectives: true });

	expect(() => project.compileSource(`// @ts-nocheck\n${source}`)).toThrow(message);
});

it("handles a call whose callee has the never type after semantic checks are disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	const output = project.compileSource("// @ts-nocheck\ndeclare const callback: never; callback();");
	expect(output).toContain("callback()");
});

it("lowers an untyped this receiver when semantic checks are disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	const output = project.compileSource("// @ts-nocheck\nfunction read() { return this; }");
	expect(output).toContain("return self");
});

it("preserves local namespace export specifiers when semantic checks are disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	const output = project.compileSource(
		"// @ts-nocheck\nnamespace N { const value = 42; export { value }; } print(N.value);",
	);
	expect(output).toContain("_container.value = value");
});

it("accepts namespace export alias references when semantic checks are disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	const output = project.compileSource(
		"// @ts-nocheck\nnamespace N { const value = 42; export { value as alias }; print(alias); }",
	);

	expect(output).toContain("print(alias)");
});

it.each([
	["class prototype", "export class Value {} export = Value;"],
	["function property", "export function Value() {} Value.property = 42; export = Value;"],
])("accepts namespace export-equals with a %s when semantic checks are disabled", (name, body) => {
	const project = createTestProject({ allowCommentDirectives: true });
	const output = project.compileSource(`// @ts-nocheck\nnamespace N { ${body} } print(N);`);

	expect(output).toContain("print(N)");
});
