import * as ts from "ts-morph";
import { checkReserved, getBindingData, transpileCallExpression, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isTupleReturnType, shouldHoist } from "../typeUtilities";

export function transpileVariableDeclaration(state: TranspilerState, node: ts.VariableDeclaration) {
	const lhs = node.getNameNode();
	const rhs = node.getInitializer();

	const parent = node.getParent();
	const grandParent = parent.getParent();
	const isExported = ts.TypeGuards.isVariableStatement(grandParent) && grandParent.isExported();

	let decKind = ts.VariableDeclarationKind.Const;
	if (ts.TypeGuards.isVariableDeclarationList(parent)) {
		decKind = parent.getDeclarationKind();
	}

	let parentName = "";
	if (isExported) {
		parentName = state.getExportContextName(grandParent);
	}

	if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
		const isFlatBinding = lhs
			.getElements()
			.filter(v => ts.TypeGuards.isBindingElement(v))
			.every(bindingElement => bindingElement.getChildAtIndex(0).getKind() === ts.SyntaxKind.Identifier);
		if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleReturnType(rhs)) {
			const names = new Array<string>();
			const values = new Array<string>();
			for (const element of lhs.getElements()) {
				if (ts.TypeGuards.isBindingElement(element)) {
					const nameNode = element.getNameNode();
					if (ts.TypeGuards.isIdentifier(nameNode)) {
						names.push(transpileExpression(state, nameNode));
					}
				} else if (ts.TypeGuards.isOmittedExpression(element)) {
					names.push("_");
				}
			}
			values.push(transpileCallExpression(state, rhs, true));
			if (isExported && decKind === ts.VariableDeclarationKind.Let) {
				return state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			} else {
				if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
					names.forEach(name => state.pushExport(name, grandParent));
				}
				return state.indent + `local ${names.join(", ")} = ${values.join(", ")};\n`;
			}
		}
	}

	let result = "";
	if (ts.TypeGuards.isIdentifier(lhs)) {
		const name = lhs.getText();
		checkReserved(name, lhs);
		if (rhs) {
			const value = transpileExpression(state, rhs);
			if (isExported && decKind === ts.VariableDeclarationKind.Let) {
				result += state.indent + `${parentName}.${name} = ${value};\n`;
			} else {
				if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
					state.pushExport(name, grandParent);
				}
				if (shouldHoist(grandParent, lhs)) {
					state.pushHoistStack(name);
					result += state.indent + `${name} = ${value};\n`;
				} else {
					result += state.indent + `local ${name} = ${value};\n`;
				}
			}
		} else if (!isExported) {
			if (shouldHoist(grandParent, lhs)) {
				state.pushHoistStack(name);
			} else {
				result += state.indent + `local ${name};\n`;
			}
		}
	} else if ((ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) && rhs) {
		// binding patterns MUST have rhs
		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();
		if (ts.TypeGuards.isIdentifier(rhs)) {
			getBindingData(state, names, values, preStatements, postStatements, lhs, transpileExpression(state, rhs));
		} else {
			const rootId = state.getNewId();
			const rhsStr = transpileExpression(state, rhs);
			preStatements.push(`local ${rootId} = ${rhsStr};`);
			getBindingData(state, names, values, preStatements, postStatements, lhs, rootId);
		}
		preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
		if (values.length > 0) {
			if (isExported && decKind === ts.VariableDeclarationKind.Let) {
				result += state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			} else {
				if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
					names.forEach(name => state.pushExport(name, grandParent));
				}
				result += state.indent + `local ${names.join(", ")} = ${values.join(", ")};\n`;
			}
		} else if (!isExported) {
			result += state.indent + `local ${names.join(", ")};\n`;
		}
		postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
	}

	return result;
}

export function transpileVariableDeclarationList(state: TranspilerState, node: ts.VariableDeclarationList) {
	const declarationKind = node.getDeclarationKind();
	if (declarationKind === ts.VariableDeclarationKind.Var) {
		throw new TranspilerError(
			"'var' keyword is not supported! Use 'let' or 'const' instead.",
			node,
			TranspilerErrorType.NoVarKeyword,
		);
	}

	let result = "";
	for (const declaration of node.getDeclarations()) {
		result += transpileVariableDeclaration(state, declaration);
	}
	return result;
}

export function transpileVariableStatement(state: TranspilerState, node: ts.VariableStatement) {
	const list = node.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
	return transpileVariableDeclarationList(state, list);
}
