// convert a block comment to Luau comment text, which renders multiple lines in an indented --[[ ]] block
// so the source layout of the delimiters, gutter, and indentation is removed
export function getBlockCommentText(source: string) {
	// the second * of a JSDoc comment's /** delimiter is not part of its text
	let text = source.slice(source.startsWith("/**") ? 3 : 2, -2);

	// match TypeScript's normalization of physical line endings
	text = text.replace(/\r\n?/g, "\n");

	// trailing whitespace never matters in a comment, and removing it keeps blank lines empty
	const lines = text.split("\n").map(line => line.trimEnd());

	// text on the first line follows the opening delimiter, so only later lines have source indentation
	const first = lines[0].trimStart();
	let rest = lines.slice(1);

	// remove a gutter that every line has, e.g. " * " in a JSDoc comment
	if (rest.every(line => line === "" || /^[ \t]*\*/.test(line))) {
		rest = rest.map(line => line.replace(/^[ \t]*\* ?/, ""));
	}

	// remove the indentation shared by later lines, since the renderer indents them inside --[[ ]]
	let indent = Infinity;
	for (const line of rest) {
		if (line !== "") {
			indent = Math.min(indent, line.length - line.trimStart().length);
		}
	}
	rest = rest.map(line => line.slice(indent));

	// drop the lines left empty by delimiters on their own lines, e.g. /** and */
	const result = [first, ...rest];
	if (result[0] === "") {
		result.shift();
	}
	if (result[result.length - 1] === "") {
		result.pop();
	}

	text = result.join("\n");

	// one line renders as --text, so keep a space after the dashes to avoid starting --[[ or a --! directive
	if (result.length === 1 && text !== "") {
		return ` ${text}`;
	}

	return text;
}
