import luau from "@roblox-ts/luau-ast";
import { DiagnosticFactory, errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformBreakStatement } from "TSTransformer/nodes/statements/transformBreakStatement";
import { transformClassDeclaration } from "TSTransformer/nodes/statements/transformClassDeclaration";
import { transformContinueStatement } from "TSTransformer/nodes/statements/transformContinueStatement";
import { transformDoStatement } from "TSTransformer/nodes/statements/transformDoStatement";
import { transformEnumDeclaration } from "TSTransformer/nodes/statements/transformEnumDeclaration";
import { transformExportAssignment } from "TSTransformer/nodes/statements/transformExportAssignment";
import { transformExportDeclaration } from "TSTransformer/nodes/statements/transformExportDeclaration";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformForOfStatement } from "TSTransformer/nodes/statements/transformForOfStatement";
import { transformForStatement } from "TSTransformer/nodes/statements/transformForStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformImportDeclaration } from "TSTransformer/nodes/statements/transformImportDeclaration";
import { transformImportEqualsDeclaration } from "TSTransformer/nodes/statements/transformImportEqualsDeclaration";
import { transformModuleDeclaration } from "TSTransformer/nodes/statements/transformModuleDeclaration";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformSwitchStatement } from "TSTransformer/nodes/statements/transformSwitchStatement";
import { transformThrowStatement } from "TSTransformer/nodes/statements/transformThrowStatement";
import { transformTryStatement } from "TSTransformer/nodes/statements/transformTryStatement";
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatement } from "TSTransformer/nodes/statements/transformWhileStatement";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

const NO_EMIT = () => luau.list.make<luau.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	DiagnosticService.addDiagnostic(factory(node));
	return NO_EMIT();
};

/**
 * Transforms a singular `ts.Statement` in a `luau.list<...>`.
 * @param state The current transform state.
 * @param node The `ts.Statement` to transform.
 */
export function transformStatement(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.Statement,
): luau.List<luau.Statement> {
	// if any modifiers of the node include the `declare` keyword we do not transform
	// `declare` tells us that the identifier of the node is defined somewhere else and we should trust it
	const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	if (modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) return NO_EMIT();
	// const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	// if (transformer) {
	// 	return transformer(state, prereqs, node);
	// }

	// no emit
	if (ts.isInterfaceDeclaration(node)) return NO_EMIT();
	if (ts.isTypeAliasDeclaration(node)) return NO_EMIT();
	if (ts.isEmptyStatement(node)) return NO_EMIT();

	// banned statements
	if (ts.isForInStatement(node)) return DIAGNOSTIC(errors.noForInStatement)(state, node);
	if (ts.isLabeledStatement(node)) return DIAGNOSTIC(errors.noLabeledStatement)(state, node);
	if (ts.isDebuggerStatement(node)) return DIAGNOSTIC(errors.noDebuggerStatement)(state, node);

	// regular transforms
	if (ts.isBlock(node)) return transformBlock(state, node);
	if (ts.isBreakStatement(node)) return transformBreakStatement(state, prereqs, node);
	if (ts.isClassDeclaration(node)) return transformClassDeclaration(state, node);
	if (ts.isContinueStatement(node)) return transformContinueStatement(state, node);
	if (ts.isDoStatement(node)) return transformDoStatement(state, node);
	if (ts.isEnumDeclaration(node)) return transformEnumDeclaration(state, prereqs, node);
	if (ts.isExportAssignment(node)) return transformExportAssignment(state, prereqs, node);
	if (ts.isExportDeclaration(node)) return transformExportDeclaration(state, node);
	if (ts.isExpressionStatement(node)) return transformExpressionStatement(state, prereqs, node);
	if (ts.isForOfStatement(node)) return transformForOfStatement(state, prereqs, node);
	if (ts.isForStatement(node)) return transformForStatement(state, node);
	if (ts.isFunctionDeclaration(node)) return transformFunctionDeclaration(state, node);
	if (ts.isIfStatement(node)) return transformIfStatement(state, prereqs, node);
	if (ts.isImportDeclaration(node)) return transformImportDeclaration(state, node);
	if (ts.isImportEqualsDeclaration(node)) return transformImportEqualsDeclaration(state, node);
	if (ts.isModuleDeclaration(node)) return transformModuleDeclaration(state, node);
	if (ts.isReturnStatement(node)) return transformReturnStatement(state, prereqs, node);
	if (ts.isSwitchStatement(node)) return transformSwitchStatement(state, prereqs, node);
	if (ts.isThrowStatement(node)) return transformThrowStatement(state, prereqs, node);
	if (ts.isTryStatement(node)) return transformTryStatement(state, node);
	if (ts.isVariableStatement(node)) return transformVariableStatement(state, node);
	if (ts.isWhileStatement(node)) return transformWhileStatement(state, node);

	assert(false, `Unknown statement: ${getKindName(node.kind)}`);
}
