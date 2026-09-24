import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { findLastIndex } from "Shared/util/findLastIndex";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { fixupWhitespaceAndDecodeEntities } from "TSTransformer/util/fixupWhitespaceAndDecodeEntities";
import ts from "typescript";

export function transformJsxChildren(state: TransformState, prereqs: Prereqs, children: ReadonlyArray<ts.JsxChild>) {
	const lastJsxChildIndex = findLastIndex(
		children,
		child => !ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces,
	);

	for (let i = 0; i < lastJsxChildIndex; i++) {
		const child = children[i];
		if (ts.isJsxExpression(child) && child.dotDotDotToken) {
			DiagnosticService.addDiagnostic(errors.noPrecedingJsxSpreadElement(child));
		}
	}

	return ensureTransformOrder(
		state,
		prereqs,
		children
			// ignore jsx text that only contains whitespace
			.filter(v => !ts.isJsxText(v) || !v.containsOnlyTriviaWhiteSpaces)
			// ignore empty jsx expressions, i.e. `{}`
			.filter(v => !ts.isJsxExpression(v) || v.expression !== undefined),
		(state, prereqs, node) => {
			if (ts.isJsxText(node)) {
				let text = fixupWhitespaceAndDecodeEntities(node.text);
				assert(text !== undefined);
				text = text.replace(/\\/g, "\\\\");
				text = text.replace(/"/g, '\\"');
				text = text.replace(
					// eslint-disable-next-line no-control-regex -- decoded entities can contain literal control characters
					/[\x00-\x1f\x7f]/g,
					character => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
				);
				// decoded text needs quoted escapes even when it contains both quote characters
				return luau.string(text, '"');
			}
			return transformExpression(state, prereqs, node);
		},
	);
}
