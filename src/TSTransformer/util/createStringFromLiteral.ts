import ts from "typescript";

// preserve source spelling except for escapes with different syntax or meaning in Luau
export function createStringFromLiteral(node: ts.TemplateLiteralToken | ts.StringLiteral): string {
	// node.text decodes escapes, which could turn \u005cb into \b and give it a different meaning in Luau
	const source = node.getText();

	// every token starts with a quote, backtick, or }, and ends with one delimiter except heads and middles ending in ${
	let text = source.slice(1, ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? -2 : -1);

	// match TypeScript's normalization of physical line endings in templates, leaving written \r and \n escapes intact
	// normalize before removing line continuations so CR, CRLF, and LF all use the same check
	text = text.replace(/\r\n?/g, "\n");

	// emit one Unicode code point per surrogate pair for Luau, e.g. \uD83D\uDE00 becomes \u{1f600}
	// combine high (D800-DBFF) and low (DC00-DFFF) surrogates before converting individual \uXXXX escapes
	text = text.replace(/\\\\|\\u([dD][89aAbB][\da-fA-F]{2})\\u([dD][c-fC-F][\da-fA-F]{2})/g, (escape, high, low) => {
		// consume escaped backslashes first so literal text like \\uD83D\\uDE00 stays untouched
		if (high === undefined) return escape;
		const codePoint = String.fromCharCode(parseInt(high, 16), parseInt(low, 16)).codePointAt(0)!;
		return `\\u{${codePoint.toString(16)}}`;
	});

	// consume whole escapes so \\u0041 stays literal text instead of matching a Unicode escape at the second backslash
	// [\s\S] includes physical line breaks so the same pass can remove line continuations
	text = text.replace(/\\(?:u([\da-fA-F]{4})|([\s\S]))/g, (escape, hex, character) => {
		// add the braces Luau requires for Unicode escapes, preserving \u005cb as \u{005c}b instead of decoding it to \b
		if (hex !== undefined) return `\\u{${hex}}`;

		// a backslash followed by LF, a line separator, or a paragraph separator adds no characters in TypeScript
		if ("\n\u2028\u2029".includes(character)) return "";

		// preserve shared escapes for Luau to interpret, including \xHH and existing or newly emitted \u{...} escapes
		// keep backticks escaped in templates because the emitted Luau template also uses backtick delimiters
		if ("0bfnrtvux\\\"'".includes(character) || (character === "`" && !ts.isStringLiteral(node))) {
			return escape;
		}

		// strip identity escape backslashes to match TypeScript, since Luau uses \a for a bell and \z to skip whitespace
		return character;
	});

	return text;
}
