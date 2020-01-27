import * as ts from "ts-morph";
import { wrapQuotesAndSanitizeTemplate } from ".";
import { CompilerState } from "../CompilerState";

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

export function compileStringLiteral(state: CompilerState, node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) {
	if (ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return wrapQuotesAndSanitizeTemplate(node.getText().slice(1, -1));
	} else {
		return node.getText();
	}
}
