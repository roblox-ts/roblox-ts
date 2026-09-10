import luau from "@roblox-ts/luau-ast";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformJsxExpression } from "TSTransformer/nodes/expressions/transformJsxExpression";
import ts from "typescript";

import { createTestProject } from "../createTestProject";
import { createTransformState } from "../transformer/createTransformState";

it.each(["{}", "{/* comment */}"])("emits no value or prerequisites for empty JSX expression %s", child => {
	const state = createTransformState(`
		declare namespace React {
			function createElement(tag: string, props: unknown): string;
			namespace JSX {
				type Element = string;
				interface IntrinsicElements { text: {} }
			}
		}
		const element = <text>${child}</text>;
	`);
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const statement = source.statements[1];
	assert(ts.isVariableStatement(statement));
	const element = statement.declarationList.declarations[0].initializer;
	assert(element && ts.isJsxElement(element));
	const expression = element.children[0];
	assert(ts.isJsxExpression(expression));
	const prereqs = new Prereqs();

	const result = transformJsxExpression(state, prereqs, expression);

	expect(luau.isNone(result)).toBe(true);
	expect(luau.list.isEmpty(prereqs.statements)).toBe(true);
});

it("rejects private JSX tag names during parsing even with semantic checks disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	try {
		project.compileSource("// @ts-nocheck\nconst element = <Component.#value/>;");
		throw new Error("Expected a JSX syntax diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}
		expect(error.diagnostics.map(diagnostic => diagnostic.code)).toContain(1003);
	}
});
