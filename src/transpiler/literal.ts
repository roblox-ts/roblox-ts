import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../class/TranspilerState";

export function transpileBooleanLiteral(state: TranspilerState, node: ts.BooleanLiteral) {
	return node.getLiteralValue() === true ? "true" : "false";
}

export function transpileNumericLiteral(state: TranspilerState, node: ts.NumericLiteral) {
	const text = node.getText();
	if (text.indexOf("e") !== -1) {
		return text;
	}
	return node.getLiteralValue().toString();
}

export function transpileStringLiteral(
	state: TranspilerState,
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
) {
	let text = node.getText();
	if (text.startsWith("`") && text.endsWith("`")) {
		text = text.slice(1, -1).replace(/"/g, '\\"');
		text = `"${text}"`;
	}
	return text;
}

export function transpileTemplateExpression(state: TranspilerState, node: ts.TemplateExpression) {
	const bin = new Array<string>();

	const headText = node
		.getHead()
		.getText()
		.replace(/\\"/g, '"')
		.replace(/"/g, '\\"')
		.slice(1, -2);

	if (headText.length > 0) {
		bin.push(`"${headText}"`);
	}

	for (const span of node.getLastChildIfKindOrThrow(ts.SyntaxKind.SyntaxList).getChildren()) {
		if (ts.TypeGuards.isTemplateSpan(span)) {
			const expStr = transpileExpression(state, span.getExpression());
			const trim = span.getNextSibling() ? -2 : -1;
			const literal = span
				.getLiteral()
				.getText()
				.replace(/\\"/g, '"')
				.replace(/"/g, '\\"')
				.slice(1, trim);
			bin.push(`tostring(${expStr})`);
			if (literal.length > 0) {
				bin.push(`"${literal}"`);
			}
		}
	}

	return bin.join(" .. ");
}
