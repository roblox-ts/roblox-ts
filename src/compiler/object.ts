import * as ts from "ts-morph";
import { compileExpression, compileMethodDeclaration } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, safeLuaIndex, skipNodesDownwards } from "../utility";

function assignMembers(state: CompilerState, from: string, target: string) {
	state.pushIdStack();
	const i = state.getNewId();
	const v = state.getNewId();
	const str = state.indent + `for ${i}, ${v} in pairs(${from}) do ${target}[${i}] = ${v}; end;\n`;
	state.popIdStack();
	return str;
}

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
		const context = state.enterPrecedingStatementContext();

		if (ts.TypeGuards.isPropertyAssignment(prop) || ts.TypeGuards.isShorthandPropertyAssignment(prop)) {
			let lhs: ts.Expression;
			let n = 0;
			let child = prop.getChildAtIndex(n);

			while (ts.TypeGuards.isJSDoc(child)) {
				child = prop.getChildAtIndex(++n);
			}

			child = skipNodesDownwards(child);

			if (ts.TypeGuards.isComputedPropertyName(child)) {
				lhs = skipNodesDownwards(child.getExpression());
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
				rhs = skipNodesDownwards(prop.getInitializerOrThrow());
			}

			let lhsStr = compileExpression(state, lhs);
			state.enterPrecedingStatementContext();
			const rhsStr = compileExpression(state, rhs);
			const rhsContext = state.exitPrecedingStatementContext();

			if (rhsContext.length > 0) {
				if (!ts.TypeGuards.isIdentifier(lhs) && !context.isPushed) {
					lhsStr = state.pushPrecedingStatementToReuseableId(lhs, lhsStr, rhsContext);
				}
				context.push(...rhsContext);
				context.isPushed = rhsContext.isPushed;
			}
			line = `${
				ts.TypeGuards.isIdentifier(lhs) ? safeLuaIndex("", lhs.getText()) : `[${lhsStr}]`
			} = ${rhsStr};\n`;
		} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
			line = "";
		} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
			line = compileExpression(state, skipNodesDownwards(prop.getExpression()));
		} else {
			throw new CompilerError(
				`Unexpected property type in object! Got ${prop.getKindName()}`,
				prop,
				CompilerErrorType.BadObjectPropertyType,
				true,
			);
		}

		state.exitPrecedingStatementContext();

		if (
			hasContext ||
			context.length > 0 ||
			ts.TypeGuards.isSpreadAssignment(prop) ||
			ts.TypeGuards.isMethodDeclaration(prop)
		) {
			if (!hasContext) {
				id = state.pushToDeclarationOrNewId(node, "{}", declaration => declaration.isIdentifier);
			}

			if (ts.TypeGuards.isSpreadAssignment(prop)) {
				line = assignMembers(state, line, id);
			} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
				line = state.indent + compileMethodDeclaration(state, prop, id + ":").trimLeft();
			} else {
				line = state.indent + id + (line.startsWith("[") ? "" : ".") + line;
			}

			if (hasContext) {
				state.pushPrecedingStatements(node, ...context, line);
			} else {
				state.pushPrecedingStatements(
					node,
					...lines.map(current => state.indent + id + (current.startsWith("[") ? "" : ".") + current),
					...context,
					line,
				);
				hasContext = true;
			}
		} else {
			lines.push(line);
		}
	}

	if (id) {
		state.getCurrentPrecedingStatementContext(node).isPushed = true;
		return id;
	} else {
		return "{\n" + lines.map(myLine => state.indent + joinIndentedLines([myLine], 1)).join("") + state.indent + "}";
	}
}
