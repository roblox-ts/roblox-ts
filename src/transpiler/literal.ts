import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";
import { isStringType } from "../typeUtilities";

export function transpileBooleanLiteral(state: TranspilerState, node: ts.BooleanLiteral) {
	return node.getLiteralValue() === true ? "true" : "false";
}

const SPECIAL_NUMBER_PREFIXES = [
	"b", // binary
	"o", // octal
	"x", // hex
];

function isSpecialNumberPrefix(numText: string) {
	for (const prefix of SPECIAL_NUMBER_PREFIXES) {
		if (numText.startsWith(`0${prefix}`)) {
			return true;
		}
	}
	return false;
}

export function transpileNumericLiteral(state: TranspilerState, node: ts.NumericLiteral) {
	const text = node.getText();
	if (isSpecialNumberPrefix(text)) {
		return node.getLiteralText();
	}
	return text;
}

function sanitizeTemplate(str: string) {
	str = str.replace(/(^|[^\\](?:\\\\)*)"/g, '$1\\"'); // replace " with \"
	str = str.replace(/(\r?\n|\r)/g, "\\$1"); // prefix new lines with \
	return str;
}

export function transpileStringLiteral(
	state: TranspilerState,
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
) {
	if (ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return '"' + sanitizeTemplate(node.getText().slice(1, -1)) + '"';
	} else {
		return node.getText();
	}
}

export function transpileTemplateExpression(state: TranspilerState, node: ts.TemplateExpression) {
	const bin = new Array<string>();

	const headText = sanitizeTemplate(
		node
			.getHead()
			.getText()
			.slice(1, -2),
	);
	if (headText.length > 0) {
		bin.push(`"${headText}"`);
	}

	for (const span of node.getTemplateSpans()) {
		if (ts.TypeGuards.isTemplateSpan(span)) {
			const exp = span.getExpression();

			const literal = span.getLiteral();
			let literalStr = literal.getText();
			if (ts.TypeGuards.isTemplateMiddle(literal)) {
				literalStr = literalStr.slice(1, -2);
			} else {
				literalStr = literalStr.slice(1, -1);
			}
			literalStr = sanitizeTemplate(literalStr);

			const expStr = transpileExpression(state, exp);
			if (isStringType(exp.getType())) {
				bin.push(expStr);
			} else {
				bin.push(`tostring(${expStr})`);
			}
			if (literalStr.length > 0) {
				bin.push(`"${literalStr}"`);
			}
		}
	}

	return bin.join(" .. ");
}
