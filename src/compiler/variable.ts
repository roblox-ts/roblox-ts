import * as ts from "ts-morph";
import { checkReserved, compileCallExpression, compileExpression, concatNamesAndValues } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	isArrayType,
	isIterableFunction,
	isIterableIterator,
	isMapType,
	isObjectType,
	isSetType,
	isTupleType,
	shouldHoist,
} from "../typeUtilities";
import { skipNodesDownwards, skipNodesUpwards } from "../utility";
import { compileBindingPatternAndJoin } from "./binding";
import { isValidLuaIdentifier } from "./security";

export function compileVariableDeclaration(state: CompilerState, node: ts.VariableDeclaration) {
	state.enterPrecedingStatementContext();
	const lhs = node.getNameNode();
	const rhs = skipNodesDownwards(node.getInitializer());

	const parent = skipNodesUpwards(node.getParent());
	const grandParent = skipNodesUpwards(parent.getParent());
	const isExported = ts.TypeGuards.isVariableStatement(grandParent) && grandParent.isExported();

	let decKind = ts.VariableDeclarationKind.Const;
	if (ts.TypeGuards.isVariableDeclarationList(parent)) {
		decKind = parent.getDeclarationKind();
	}

	if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
		const isFlatBinding = lhs
			.getElements()
			.filter(v => ts.TypeGuards.isBindingElement(v))
			.every(v => ts.TypeGuards.isIdentifier(v.getChildAtIndex(0)));

		if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleType(getType(rhs))) {
			const names = new Array<string>();
			const values = new Array<string>();
			for (const element of lhs.getElements()) {
				if (ts.TypeGuards.isBindingElement(element)) {
					const nameNode = element.getNameNode();
					if (ts.TypeGuards.isIdentifier(nameNode)) {
						checkReserved(nameNode);
						names.push(compileExpression(state, nameNode));
					}
				} else if (ts.TypeGuards.isOmittedExpression(element)) {
					names.push("_");
				}
			}
			values.push(compileCallExpression(state, rhs, true));
			if (isExported && decKind === ts.VariableDeclarationKind.Let) {
				let returnValue: string | undefined;
				concatNamesAndValues(state, names, values, false, str => (returnValue = str));
				return state.exitPrecedingStatementContextAndJoin() + returnValue || "";
			} else {
				if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
					names.forEach(name => state.pushExport(name, grandParent));
				}
				let returnValue: string | undefined;
				concatNamesAndValues(state, names, values, true, str => (returnValue = str));
				return state.exitPrecedingStatementContextAndJoin() + returnValue || "";
			}
		}
	}

	let result = "";
	if (ts.TypeGuards.isIdentifier(lhs)) {
		const name = checkReserved(lhs);
		if (rhs) {
			if (isExported && decKind === ts.VariableDeclarationKind.Let) {
				const parentName = state.getExportContextName(grandParent);
				state.declarationContext.set(rhs, {
					isIdentifier: false,
					set: `${parentName}.${name}`,
				});
				const value = compileExpression(state, rhs);
				if (state.declarationContext.delete(rhs)) {
					result += state.indent + `${parentName}.${name} = ${value};\n`;
				}
			} else {
				if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
					state.pushExport(name, grandParent);
				}
				if (shouldHoist(grandParent, lhs)) {
					state.pushHoistStack(name);
					state.declarationContext.set(rhs, { isIdentifier: true, set: `${name}` });
					const value = compileExpression(state, rhs);
					if (state.declarationContext.delete(rhs)) {
						result += state.indent + `${name} = ${value};\n`;
					}
				} else {
					state.declarationContext.set(rhs, {
						isIdentifier: true,
						needsLocalizing: true,
						set: `${name}`,
					});
					const value = compileExpression(state, rhs);
					if (state.declarationContext.delete(rhs)) {
						result += state.indent + `local ${name} = ${value};\n`;
					}
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
		let rhsStr = compileExpression(state, rhs);

		if (!isValidLuaIdentifier(rhsStr)) {
			const id = state.getNewId();
			state.pushPrecedingStatements(node, state.indent + `local ${id} = ${rhsStr};\n`);
			rhsStr = id;
		}

		if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
			const rhsType = getType(rhs);
			if (
				!isArrayType(rhsType) &&
				!isMapType(rhsType) &&
				!isSetType(rhsType) &&
				!isIterableIterator(rhsType, rhs) &&
				!isIterableFunction(rhsType) &&
				(isObjectType(rhsType) || ts.TypeGuards.isThisExpression(rhs))
			) {
				state.usesTSLibrary = true;
				rhsStr = rhsStr;
				const id = state.getNewId();
				state.pushPrecedingStatements(
					node,
					state.indent + `local ${id} = ${rhsStr}[TS.Symbol_iterator](${rhsStr});\n`,
				);
				rhsStr = id;
			}
		}

		result += compileBindingPatternAndJoin(state, lhs, rhsStr);

		// preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
		// if (values.length > 0) {
		// 	if (isExported && decKind === ts.VariableDeclarationKind.Let) {
		// 		concatNamesAndValues(state, names, values, false, str => (result += str));
		// 	} else {
		// 		if (isExported && ts.TypeGuards.isVariableStatement(grandParent)) {
		// 			names.forEach(name => state.pushExport(name, grandParent));
		// 		}
		// 		concatNamesAndValues(state, names, values, true, str => (result += str));
		// 	}
		// }
		// postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
	}

	return state.exitPrecedingStatementContextAndJoin() + result;
}

export function compileVariableDeclarationList(state: CompilerState, node: ts.VariableDeclarationList) {
	const declarationKind = node.getDeclarationKind();
	if (declarationKind === ts.VariableDeclarationKind.Var) {
		throw new CompilerError(
			"'var' keyword is not supported! Use 'let' or 'const' instead.",
			node,
			CompilerErrorType.NoVarKeyword,
		);
	}

	return node
		.getDeclarations()
		.reduce((result, declaration) => result + compileVariableDeclaration(state, declaration), "");
}

export function compileVariableStatement(state: CompilerState, node: ts.VariableStatement) {
	const list = node.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
	return compileVariableDeclarationList(state, list);
}
