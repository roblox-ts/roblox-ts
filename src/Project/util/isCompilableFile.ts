import { TS_EXT, TSX_EXT } from "Shared/constants";

export function isCompilableFile(fsPath: string) {
	return fsPath.endsWith(TS_EXT) || fsPath.endsWith(TSX_EXT);
}
