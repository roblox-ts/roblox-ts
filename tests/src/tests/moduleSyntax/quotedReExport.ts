export { 'a"b' as 're"quoted', "a\\b" as "re\\slash", "a\\b'\"c" as "re\\'\"mixed" } from "./quotedExport";
export * as 'namespace"\\' from "./quotedExport";

const localValue = 7;
export { localValue as "local\\key" };
