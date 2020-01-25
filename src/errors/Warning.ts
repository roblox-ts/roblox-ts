import * as ts from "ts-morph";
import { yellow } from "../utility/text";

export function warn(message: string, node?: ts.Node) {
	if (node) {
		console.log(
			"%s:%d:%d - %s %s",
			node.getSourceFile().getFilePath(),
			node.getStartLineNumber(),
			node.getNonWhitespaceStart() - node.getStartLinePos(),
			yellow("Compiler Warning:"),
			message,
		);
	} else {
		console.log(yellow("Compiler Warning:"), message);
	}
}
