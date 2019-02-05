import * as ts from "ts-morph";
import {
	checkReserved,
	transpileExpression,
	transpileIdentifier,
	transpileMethodDeclaration,
	transpileNumericLiteral,
	transpileStringLiteral,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";

export function transpileObjectLiteralExpression(state: TranspilerState, node: ts.ObjectLiteralExpression) {
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

			let lhs: string;

			let n = 0;
			let child = prop.getChildAtIndex(n);
			while (ts.TypeGuards.isJSDoc(child)) {
				n++;
				child = prop.getChildAtIndex(n);
			}

			if (ts.TypeGuards.isComputedPropertyName(child)) {
				const expStr = transpileExpression(state, child.getExpression());
				lhs = `[${expStr}]`;
			} else if (ts.TypeGuards.isStringLiteral(child)) {
				const expStr = transpileStringLiteral(state, child);
				lhs = `[${expStr}]`;
			} else if (ts.TypeGuards.isIdentifier(child)) {
				lhs = child.getText();
				checkReserved(lhs, child);
			} else if (ts.TypeGuards.isNumericLiteral(child)) {
				const expStr = transpileNumericLiteral(state, child);
				lhs = `[${expStr}]`;
			} else {
				throw new TranspilerError(
					`Unexpected type of object index! (${child.getKindName()})`,
					child,
					TranspilerErrorType.UnexpectedObjectIndex,
				);
			}

			if (!isInObject) {
				parts.push("{\n");
				state.pushIndent();
			}

			let rhs: string; // You may want to move this around
			if (ts.TypeGuards.isShorthandPropertyAssignment(prop) && ts.TypeGuards.isIdentifier(child)) {
				lhs = prop.getName();
				rhs = transpileIdentifier(state, child);
				checkReserved(lhs, child);
			} else {
				rhs = transpileExpression(state, prop.getInitializerOrThrow());
			}

			parts[parts.length - 1] += state.indent + `${lhs} = ${rhs};\n`;
			isInObject = true;
		} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
			if (first) {
				firstIsObj = true;
			}
			if (!isInObject) {
				parts.push("{\n");
				state.pushIndent();
			}
			parts[parts.length - 1] += transpileMethodDeclaration(state, prop);
			isInObject = true;
		} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
			if (first) {
				firstIsObj = false;
			}
			if (isInObject) {
				state.popIndent();
				parts[parts.length - 1] += state.indent + "}";
			}
			const expStr = transpileExpression(state, prop.getExpression());
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
		if (!firstIsObj) {
			return `TS.Object_assign({}, ${params})`;
		} else {
			return `TS.Object_assign(${params})`;
		}
	} else {
		return parts.join(", ");
	}
}
