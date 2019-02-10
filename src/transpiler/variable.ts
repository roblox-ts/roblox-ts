import * as ts from "ts-morph";
import { checkReserved, getBindingData, isBindingPattern, transpileCallExpression, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isTupleType } from "../typeUtilities";
import { checkNonAny } from "./security";

export function transpileVariableDeclaration(state: TranspilerState, node: ts.VariableDeclaration) {
	const lhs = node.getNameNode();
	const rhs = node.getInitializer();

	const parent = node.getParent();
	const grandParent = parent.getParent();
	const isExported = ts.TypeGuards.isVariableStatement(grandParent) && grandParent.isExported();

	let parentName = "";
	if (isExported) {
		parentName = state.getExportContextName(grandParent);
	}

	// If it is a foldable constant
	if (
		rhs &&
		ts.TypeGuards.isNumericLiteral(rhs) &&
		ts.TypeGuards.isVariableDeclarationList(parent) &&
		grandParent.getParent() === grandParent.getSourceFile() &&
		!isExported &&
		parent.getDeclarationKind() === ts.VariableDeclarationKind.Const
	) {
		const declarationName = node.getName();
		checkReserved(declarationName, node);
		state.variableAliases.set(declarationName, transpileExpression(state, rhs));
		return "";
	}

	// optimized tuple return
	if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
		const isFlatBinding = lhs
			.getElements()
			.filter(v => ts.TypeGuards.isBindingElement(v))
			.every(bindingElement => bindingElement.getChildAtIndex(0).getKind() === ts.SyntaxKind.Identifier);
		if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleType(rhs.getReturnType())) {
			let names = new Array<string>();
			const values = new Array<string>();
			for (const element of lhs.getElements()) {
				if (ts.TypeGuards.isBindingElement(element)) {
					names.push(element.getChildAtIndex(0).getText());
				} else if (ts.TypeGuards.isOmittedExpression(element)) {
					names.push("_");
				}
			}
			values.push(transpileCallExpression(state, rhs, true));
			if (isExported) {
				names = names.map(name => `${parentName}.${name}`);
				return state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			} else {
				return state.indent + `local ${names.join(", ")} = ${values.join(", ")};\n`;
			}
		}
	}

	let result = "";
	if (ts.TypeGuards.isIdentifier(lhs)) {
		checkNonAny(lhs);
		const name = lhs.getText();
		checkReserved(name, lhs);
		if (rhs) {
			const value = transpileExpression(state, rhs);
			if (isExported) {
				result += state.indent + `${parentName}.${name} = ${value};\n`;
			} else {
				if (ts.TypeGuards.isFunctionExpression(rhs) || ts.TypeGuards.isArrowFunction(rhs)) {
					result += state.indent + `local ${name}; ${name} = ${value};\n`;
				} else {
					result += state.indent + `local ${name} = ${value};\n`;
				}
			}
		} else if (!isExported) {
			result += state.indent + `local ${name};\n`;
		}
	} else if (isBindingPattern(lhs) && rhs) { // binding patterns MUST have rhs
		let names = new Array<string>();
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
			if (isExported) {
				names = names.map(name => `${parentName}.${name}`);
				result += state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			} else {
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
