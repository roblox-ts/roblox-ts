import * as ts from "ts-morph";
import { compileExpression, compileMethodDeclaration } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines } from "../utility";

export function compileObjectLiteralExpression(state: CompilerState, node: ts.ObjectLiteralExpression) {
	const properties = node.getProperties();
	if (properties.length === 0) {
		return "{}";
	}
	let isInObject = false;
	let first = true;
	let firstIsObj = false;
	const parts = new Array<string>();
	for (const prop of properties) {
		if (ts.TypeGuards.isPropertyAssignment(prop) || ts.TypeGuards.isShorthandPropertyAssignment(prop)) {
			if (first) {
				firstIsObj = true;
			}

			let lhs: ts.Expression;

			let n = 0;
			let child = prop.getChildAtIndex(n);
			while (ts.TypeGuards.isJSDoc(child)) {
				child = prop.getChildAtIndex(++n);
			}

			if (ts.TypeGuards.isComputedPropertyName(child)) {
				lhs = child.getExpression();
			} else if (
				ts.TypeGuards.isIdentifier(child) ||
				ts.TypeGuards.isStringLiteral(child) ||
				ts.TypeGuards.isNumericLiteral(child)
			) {
				lhs = child;
			} else {
				throw new CompilerError(
					`Unexpected type of object index! (${child.getKindName()})`,
					child,
					CompilerErrorType.UnexpectedObjectIndex,
				);
			}

			if (!isInObject) {
				parts.push("{\n");
				state.pushIndent();
			}

			let rhs: ts.Expression; // You may want to move this around
			if (ts.TypeGuards.isShorthandPropertyAssignment(prop) && ts.TypeGuards.isIdentifier(child)) {
				lhs = prop.getNameNode();
				rhs = child;
			} else {
				rhs = prop.getInitializerOrThrow();
			}

			state.enterPrecedingStatementContext();
			let lhsStr = compileExpression(state, lhs);
			const lhsContext = state.exitPrecedingStatementContext();

			if (lhsContext.length > 0) {
				lhsContext.push(state.indent + `return ${lhsStr};\n`);
				lhsStr = "(function()\n" + joinIndentedLines(lhsContext, 1) + state.indent + "end)()";
			}

			state.enterPrecedingStatementContext();
			let rhsStr = compileExpression(state, rhs);
			const rhsContext = state.exitPrecedingStatementContext();

			if (rhsContext.length > 0) {
				rhsContext.push(state.indent + `return ${rhsStr};\n`);
				rhsStr = "(function()\n" + joinIndentedLines(rhsContext, 1) + state.indent + "end)()";
			}

			if (!ts.TypeGuards.isIdentifier(lhs)) {
				lhsStr = `[${lhsStr}]`;
			}
			parts[parts.length - 1] += state.indent + `${lhsStr} = ${rhsStr};\n`;
			isInObject = true;
		} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
			if (first) {
				firstIsObj = true;
			}
			if (!isInObject) {
				parts.push("{\n");
				state.pushIndent();
			}
			parts[parts.length - 1] += compileMethodDeclaration(state, prop);
			isInObject = true;
		} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
			if (first) {
				firstIsObj = false;
			}
			if (isInObject) {
				state.popIndent();
				parts[parts.length - 1] += state.indent + "}";
			}
			const expStr = compileExpression(state, prop.getExpression());
			parts.push(expStr);
			isInObject = false;
		}

		if (first) {
			first = false;
		}
	}

	if (isInObject) {
		state.popIndent();
		parts[parts.length - 1] += state.indent + "}";
	}

	if (properties.some(v => ts.TypeGuards.isSpreadAssignment(v))) {
		const params = parts.join(", ");
		state.usesTSLibrary = true;
		if (!firstIsObj) {
			return `TS.Object_assign({}, ${params})`;
		} else {
			return `TS.Object_assign(${params})`;
		}
	} else {
		return parts.join(", ");
	}
}
