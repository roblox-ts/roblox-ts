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

	const lines = new Array<string>();
	let hasContext = false;
	let id = "";
	let line: string;

	for (const prop of properties) {
		state.enterPrecedingStatementContext();

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

			const lhsStr = compileExpression(state, lhs);
			const rhsStr = compileExpression(state, rhs);

			line = `${ts.TypeGuards.isIdentifier(lhs) ? lhsStr : `[${lhsStr}]`} = ${rhsStr};\n`;
		} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
			line = compileMethodDeclaration(state, prop).trimLeft();
		} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
			line = compileExpression(state, prop.getExpression());
		} else {
			throw new CompilerError(
				`Unexpected property type in object! Got ${prop.getKindName()}`,
				prop,
				CompilerErrorType.BadObjectPropertyType,
				true,
			);
		}

		const context = state.exitPrecedingStatementContext();

		if (hasContext) {
			state.pushPrecedingStatements(
				node,
				...context,
				state.indent + id + (line.startsWith("[") ? "" : ".") + line,
			);
		} else if (context.length > 0) {
			id = state.pushToDeclarationOrNewId(node, "{}", declaration => declaration.isIdentifier);
			state.pushPrecedingStatements(
				node,
				...lines.map(current => state.indent + id + (current.startsWith("[") ? "" : ".") + current),
				...context,
				state.indent + id + (line.startsWith("[") ? "" : ".") + line,
			);
			hasContext = true;
		} else {
			lines.push(line);
		}
	}

	if (id) {
		return id;
	} else if (properties.some(v => ts.TypeGuards.isSpreadAssignment(v))) {
		const params = lines.join(", ");
		state.usesTSLibrary = true;
		if (ts.TypeGuards.isSpreadAssignment(properties[0])) {
			return `TS.Object_assign({}, ${params})`;
		} else {
			return `TS.Object_assign(${params})`;
		}
	} else {
		return `{\n${lines.map(myLine => state.indent + joinIndentedLines([myLine], 1)).join("")}${state.indent}}`;
	}
}
