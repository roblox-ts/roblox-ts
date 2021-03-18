import ts from "byots";
import { errors } from "Shared/diagnostics";

export function fileContainsTSIgnore(sourceFile: ts.SourceFile) {
	if (sourceFile.commentDirectives || sourceFile.pragmas.get("ts-nocheck")) {
		return [errors.noTsComments(sourceFile)];
	}
	return [];
}
