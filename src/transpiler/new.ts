import * as ts from "ts-morph";
import { inheritsFromRoact, transpileCallArguments, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { inheritsFrom } from "../typeUtilities";
import { suggest } from "../utility";

export function transpileNewExpression(state: TranspilerState, node: ts.NewExpression) {
	const expNode = node.getExpression();
	const expressionType = expNode.getType();
	const name = transpileExpression(state, expNode);
	const args = node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken) ? node.getArguments() : [];
	const params = transpileCallArguments(state, args);

	if (inheritsFromRoact(expressionType)) {
		throw new TranspilerError(
			`Roact components cannot be created using new\n` +
				suggest(`Proper usage: Roact.createElement(${name}), <${name}></${name}> or </${name}>`),
			node,
			TranspilerErrorType.RoactNoNewComponentAllowed,
		);
	}

	if (inheritsFrom(expressionType, "ArrayConstructor")) {
		return "{}";
	}

	if (inheritsFrom(expressionType, "MapConstructor")) {
		if (args.length > 0) {
			state.usesTSLibrary = true;
			return `TS.map_new(${params})`;
		} else {
			return "{}";
		}
	}

	if (inheritsFrom(expressionType, "SetConstructor")) {
		if (args.length > 0) {
			state.usesTSLibrary = true;
			return `TS.set_new(${params})`;
		} else {
			return "{}";
		}
	}

	if (inheritsFrom(expressionType, "WeakMapConstructor") || inheritsFrom(expressionType, "WeakSetConstructor")) {
		return `setmetatable({}, { __mode = "k" })`;
	}

	return `${name}.new(${params})`;
}
