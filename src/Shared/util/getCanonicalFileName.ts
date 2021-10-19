import ts from "typescript";

// ts.sys does not exist in browser, and thus the playground
// VirtualFileSystem is case-sensitive, so default to true
export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys?.useCaseSensitiveFileNames ?? true);
