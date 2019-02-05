import * as ts from "ts-morph";
import { checkReserved, getBindingData, isBindingPattern, transpileCallExpression, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isTupleType } from "../typeUtilities";

export function transpileVariableDeclarationList(state: TranspilerState, node: ts.VariableDeclarationList) {
	const declarationKind = node.getDeclarationKind();
	if (declarationKind === ts.VariableDeclarationKind.Var) {
		throw new TranspilerError(
			"'var' keyword is not supported! Use 'let' or 'const' instead.",
			node,
			TranspilerErrorType.NoVarKeyword,
		);
	}

	const parent = node.getParent();
	const names = new Array<string>();
	const values = new Array<string>();
	const preStatements = new Array<string>();
	const postStatements = new Array<string>();
	const declarations = node.getDeclarations();
	const isExported = parent && ts.TypeGuards.isVariableStatement(parent) && parent.isExported();
	let parentName: string | undefined;

	if (isExported) {
		parentName = state.getExportContextName(parent);
	}

	if (declarations.length === 1) {
		const declaration = declarations[0];
		const lhs = declaration.getChildAtIndex(0);
		const equalsToken = declaration.getFirstChildByKind(ts.SyntaxKind.EqualsToken);

		let rhs: ts.Node | undefined;
		if (equalsToken) {
			rhs = equalsToken.getNextSibling();
		}

		if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
			const isFlatBinding = lhs
				.getElements()
				.filter(v => ts.TypeGuards.isBindingElement(v))
				.every(bindingElement => bindingElement.getChildAtIndex(0).getKind() === ts.SyntaxKind.Identifier);
			if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleType(rhs.getReturnType())) {
				for (const element of lhs.getElements()) {
					if (ts.TypeGuards.isBindingElement(element)) {
						names.push(element.getChildAtIndex(0).getText());
					} else if (ts.TypeGuards.isOmittedExpression(element)) {
						names.push("_");
					}
				}
				values.push(transpileCallExpression(state, rhs, true));
				const flatNamesStr = names.join(", ");
				const flatValuesStr = values.join(", ");
				return state.indent + `local ${flatNamesStr} = ${flatValuesStr};\n`;
			}
		}
	}

	for (const declaration of declarations) {
		const lhs = declaration.getChildAtIndex(0);
		const equalsToken = declaration.getFirstChildByKind(ts.SyntaxKind.EqualsToken);

		let rhs: ts.Node | undefined;
		if (equalsToken) {
			rhs = equalsToken.getNextSibling();
		}

		// If it is a foldable constant
		if (
			rhs &&
			parent &&
			parent.getParent() === parent.getSourceFile() &&
			!isExported &&
			declarationKind === ts.VariableDeclarationKind.Const
		) {
			if (ts.TypeGuards.isNumericLiteral(rhs)) {
				const declarationName = declaration.getName();
				checkReserved(declarationName, node);
				state.variableAliases.set(declarationName, declaration.getType().getText());
				return "";
			}
		}

		if (ts.TypeGuards.isIdentifier(lhs)) {
			if (rhs || !isExported) {
				const name = lhs.getText();
				checkReserved(name, lhs);
				names.push(name);
				if (rhs) {
					const rhsStr = transpileExpression(state, rhs as ts.Expression);
					if (ts.TypeGuards.isArrowFunction(rhs) && declarationKind === ts.VariableDeclarationKind.Const) {
						if (isExported && ts.TypeGuards.isExportableNode(parent)) {
							state.pushExport(name, parent);
						}
						state.hoistStack[state.hoistStack.length - 1].add(name);
						return state.indent + name + " = " + rhsStr + ";\n";
					}
					values.push(rhsStr);
				} else {
					values.push("nil");
				}
			}
		} else if (isBindingPattern(lhs)) {
			if (rhs && ts.TypeGuards.isIdentifier(rhs)) {
				const rhsStr = transpileExpression(state, rhs);
				getBindingData(state, names, values, preStatements, postStatements, lhs, rhsStr);
			} else {
				const rootId = state.getNewId();
				if (rhs) {
					const rhsStr = transpileExpression(state, rhs as ts.Expression);
					preStatements.push(`local ${rootId} = ${rhsStr};`);
				} else {
					preStatements.push(`local ${rootId};`); // ???
				}
				getBindingData(state, names, values, preStatements, postStatements, lhs, rootId);
			}
		}
	}

	while (values[values.length - 1] === "nil") {
		values.pop();
	}

	let result = "";
	preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));

	if (values.length > 0) {
		const valuesStr = values.join(", ");

		if (isExported) {
			const namesStr = names.join(`, ${parentName}.`);
			result += state.indent + `${parentName}.${namesStr} = ${valuesStr};\n`;
		} else {
			const namesStr = names.join(", ");
			result += state.indent + `local ${namesStr} = ${valuesStr};\n`;
		}
	} else if (names.length > 0) {
		result += state.indent + `local ${names.join(", ")};\n`;
	}

	postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
	return result;
}

export function transpileVariableStatement(state: TranspilerState, node: ts.VariableStatement) {
	const list = node.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
	return transpileVariableDeclarationList(state, list);
}
