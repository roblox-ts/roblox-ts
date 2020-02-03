import * as ts from "ts-morph";
import { compileExpression, compileList } from ".";
import { CompilerState } from "../CompilerState";
import { skipNodesDownwards } from "../utility/general";
import { getType, isStringType } from "../utility/type";

/** Equivalent to Lua's `#(str)`/`str:len()`
 *
 * Iterates over each codePoint in a given string and determines how many bytes would be necessary in utf-8 (Lua's string encoding)
 */
export function getLuaStringLength(str: string) {
	let numLuaCharacters = 0;

	for (
		let i = 0, { length } = str, currentCodePoint: number;
		i < length;
		/*	when codePointAt returns a value over 0xffff it is encoded as two surrogate halves in JS
			e.g. "\u{1F4A9}" is of length 2 and is encoded like so: ["\u{1F4A9}".charCodeAt(0), "\u{1F4A9}".charCodeAt(1)] -> [55357, 56489]
			`codePointAt` grabs 2 surrogate halves at a time if possible, which means we need to add 2 to the iterator in that case
			["\u{1F4A9}".codePointAt(0), "\u{1F4A9}".codePointAt(1)] -> [128169, 56489]
				notice how the second value is the same as the second charCode in the original encoding.
				that's because at the first position, we can grab the character at `0` and greedily grab the character at `1`
				hence, the second position was already read and we should skip to charCodeAt(2) (when 2 is fewer than `length`)

			"In UTF-16, code points greater than or equal to 2^16 are encoded using two 16-bit code units."
			Source: https://en.wikipedia.org/wiki/UTF-16#History
		*/
		i += currentCodePoint > 0xffff ? 2 : 1
	) {
		currentCodePoint = str.codePointAt(i)!; // we check i < length

		// See: https://en.wikipedia.org/wiki/UTF-8#Description
		numLuaCharacters +=
			currentCodePoint > 0x007f ? (currentCodePoint > 0x07ff ? (currentCodePoint > 0xffff ? 4 : 3) : 2) : 1;
	}

	return numLuaCharacters;
}

export function wrapQuotesAndSanitizeTemplate(str: string) {
	return (
		'"' +
		str
			.replace(/\\*"/g, w => (w.length % 2 ? "\\" + w : w)) // replace " with \"
			.replace(/(\r?\n|\r)/g, "\\$1") + // prefix new lines with \
		'"'
	);
}

interface TemplateParts {
	literals: Array<string>;
	expressions: Array<string>;
}

function getTemplateParts(
	state: CompilerState,
	node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
	tostring: boolean,
): TemplateParts {
	if (ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return {
			expressions: [],
			literals: [wrapQuotesAndSanitizeTemplate(node.getText().slice(1, -1))],
		};
	} else {
		const literals = [
			wrapQuotesAndSanitizeTemplate(
				node
					.getHead()
					.getText()
					.slice(1, -2),
			),
		];

		for (const span of node.getTemplateSpans()) {
			const literal = span.getLiteral();
			literals.push(
				wrapQuotesAndSanitizeTemplate(
					literal.getText().slice(1, ts.TypeGuards.isTemplateMiddle(literal) ? -2 : -1),
				),
			);
		}

		const expressions = compileList(
			state,
			node.getTemplateSpans().map(span => skipNodesDownwards(span.getExpression())),
			(_, exp) => {
				const expStr = compileExpression(state, exp);
				if (tostring) {
					return isStringType(getType(exp)) ? expStr : `tostring(${expStr})`;
				} else {
					return expStr;
				}
			},
		);

		return {
			expressions,
			literals,
		};
	}
}

export function compileTemplateExpression(state: CompilerState, node: ts.TemplateExpression) {
	const parts = getTemplateParts(state, node, true);

	const bin = new Array<string>();
	for (let i = 0; i < parts.expressions.length; i++) {
		bin.push(parts.literals[i]);
		bin.push(parts.expressions[i]);
	}
	bin.push(parts.literals[parts.literals.length - 1]);

	return bin.filter(v => v !== `""`).join(" .. ");
}

export function compileTaggedTemplateExpression(state: CompilerState, node: ts.TaggedTemplateExpression) {
	const tagStr = compileExpression(state, skipNodesDownwards(node.getTag()));
	const parts = getTemplateParts(state, node.getTemplate(), false);
	if (parts.expressions.length > 0) {
		return `${tagStr}({ ${parts.literals.join(", ")} }, ${parts.expressions.join(", ")})`;
	} else {
		return `${tagStr}({ ${parts.literals.join(", ")} })`;
	}
}
