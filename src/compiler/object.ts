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

	const lines = new Array<string>();
	let hasContext = false;
	let id = "";
	state.pushIndent();

	for (const prop of properties) {
		if (ts.TypeGuards.isPropertyAssignment(prop) || ts.TypeGuards.isShorthandPropertyAssignment(prop)) {
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

			let rhs: ts.Expression; // You may want to move this around
			if (ts.TypeGuards.isShorthandPropertyAssignment(prop) && ts.TypeGuards.isIdentifier(child)) {
				lhs = prop.getNameNode();
				rhs = child;
			} else {
				rhs = prop.getInitializerOrThrow();
			}

			state.enterPrecedingStatementContext();
			const lhsStr = compileExpression(state, lhs);
			const rhsStr = compileExpression(state, rhs);
			const context = state.exitPrecedingStatementContext();

			const line = state.indent + `${ts.TypeGuards.isIdentifier(lhs) ? lhsStr : `[${lhsStr}]`} = ${rhsStr};\n`;

			if (hasContext) {
				state.pushPrecedingStatements(lhs, id + (line.startsWith("[") ? "" : ".") + line);
			} else if (context.length > 0) {
				hasContext = true;
				state.popIndent();
				id = state.pushToDeclarationOrNewId(node, "{}", declaration => declaration.isIdentifier);
				state.pushPrecedingStatements(
					lhs,
					...lines.map(current => {
						console.log((current = current.trimLeft()));
						return state.indent + id + (current.startsWith("[") ? "" : ".") + current;
					}),
					...context,
					state.indent + id + line,
				);
			} else {
				lines.push(line);
			}

			isInObject = true;
		} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
			lines.push(compileMethodDeclaration(state, prop));
			isInObject = true;
		} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
			const expStr = compileExpression(state, prop.getExpression());
			lines.push(expStr);
			isInObject = false;
		}
	}
	state.popIndent();
	if (properties.some(v => ts.TypeGuards.isSpreadAssignment(v))) {
		const params = lines.join(", ");
		state.usesTSLibrary = true;
		if (ts.TypeGuards.isSpreadAssignment(properties[0])) {
			return `TS.Object_assign({}, ${params})`;
		} else {
			return `TS.Object_assign(${params})`;
		}
	} else {
		return `{\n${lines.join("")}${state.indent}}`;
	}
}
