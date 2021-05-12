import ts from "byots";

const SCOPE = "@rbxts/";
const PACKAGE = "types";

export function transformTypeReferenceDirectives(context: ts.TransformationContext) {
	return (sourceFile: ts.SourceFile | ts.Bundle) => {
		if (ts.isSourceFile(sourceFile)) {
			for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
				if (typeReferenceDirective.fileName === PACKAGE) {
					typeReferenceDirective.fileName = SCOPE + PACKAGE;
					typeReferenceDirective.end += SCOPE.length;
				}
			}
		}
		return sourceFile;
	};
}
