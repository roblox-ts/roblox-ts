import ts from "byots";
import { assert } from "Shared/util/assert";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { TransformState } from "TSTransformer/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

export function transformImportEqualsDeclaration(state: TransformState, node: ts.ImportEqualsDeclaration) {
	const moduleReference = node.moduleReference;
	if (ts.isExternalModuleReference(moduleReference)) {
		assert(ts.isStringLiteral(moduleReference.expression));
		const importExp = createImportExpression(state, node.getSourceFile(), moduleReference.expression);
		return transformVariable(state, node.name, importExp).statements;
	} else {
		// Identifier | QualifiedName
		assert(false, "Not implemented!");
	}
}
