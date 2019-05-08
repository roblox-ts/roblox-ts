import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { isStringType } from "../typeUtilities";
import { compileList } from "./call";

export function compileBooleanLiteral(state: CompilerState, node: ts.BooleanLiteral) {
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

export function compileNumericLiteral(state: CompilerState, node: ts.NumericLiteral) {
	const text = node.getText();
	if (isSpecialNumberPrefix(text)) {
		return node.getLiteralText();
	}
	return text.replace(/_/g, "");
}

function sanitizeTemplate(str: string) {
	str = str.replace(/(^|[^\\](?:\\\\)*)"/g, '$1\\"'); // replace " with \"
	str = str.replace(/(\r?\n|\r)/g, "\\$1"); // prefix new lines with \
	return str;
}

export function compileStringLiteral(state: CompilerState, node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) {
	if (ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return '"' + sanitizeTemplate(node.getText().slice(1, -1)) + '"';
	} else {
		return node.getText();
	}
}

export function compileTemplateExpression(state: CompilerState, node: ts.TemplateExpression) {
	const followingStrs = new Map<ts.Expression, string>();

	const bin = compileList(
		state,
		node
			.getTemplateSpans()
			.filter(span => ts.TypeGuards.isTemplateSpan(span))
			.map(span => {
				const exp = span.getExpression();
				const literal = span.getLiteral();
				const literalStr = sanitizeTemplate(
					literal.getText().slice(1, ts.TypeGuards.isTemplateMiddle(literal) ? -2 : -1),
				);

				if (literalStr.length > 0) {
					followingStrs.set(exp, ` .. "${literalStr}"`);
				}
				return exp;
			}),
		(_, exp) => {
			const expStr = compileExpression(state, exp);
			return isStringType(exp.getType()) ? expStr : `tostring(${expStr})` + (followingStrs.get(exp) || "");
		},
	);

	const headText = sanitizeTemplate(
		node
			.getHead()
			.getText()
			.slice(1, -2),
	);

	if (headText.length > 0) {
		bin.unshift(`"${headText}"`);
	}

	return bin.join(" .. ");
}
