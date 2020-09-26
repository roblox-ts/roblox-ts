import { DTS_EXT, TSX_EXT, TS_EXT } from "Shared/constants";

export function isCompilableFile(fsPath: string) {
	if (fsPath.endsWith(DTS_EXT)) {
		return false;
	}
	return fsPath.endsWith(TS_EXT) || fsPath.endsWith(TSX_EXT);
}
