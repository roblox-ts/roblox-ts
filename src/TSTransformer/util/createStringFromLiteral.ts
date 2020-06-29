import ts from "byots";
import luau from "LuauAST";

const TEMPLATE_EDGE = "`".length;
const TEMPLATE_EXP_START = "${".length;
const TEMPLATE_EXP_END = "}".length;

/**
 * Creates a `luau.StringLiteral` from a `ts.TemplateLiteralToken | ts.StringLiteral`
 * Cannot just use `node.text` because that converts `\\n` to be `\n`.
 */
export function createStringFromLiteral(node: ts.TemplateLiteralToken | ts.StringLiteral): luau.StringLiteral {
	let text = node.getText();
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		text = ts.stripQuotes(text);
	} else if (ts.isTemplateHead(node)) {
		// remove starting ` and ending ${
		text = text.slice(TEMPLATE_EDGE, -TEMPLATE_EXP_START);
	} else if (ts.isTemplateMiddle(node)) {
		// remove starting } and ending ${
		text = text.slice(TEMPLATE_EXP_END, -TEMPLATE_EXP_START);
	} else if (ts.isTemplateTail(node)) {
		// remove starting } and ending `
		text = text.slice(TEMPLATE_EXP_END, -TEMPLATE_EDGE);
	}
	return luau.string(text);
}
