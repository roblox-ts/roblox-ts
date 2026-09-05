export const backslash = "a\\b";
export const unicodeBackslash = "a\u005cb";
export const literalEscapeText = "a\\u005cb";
export const mixedQuotes = "a\\b'\"c";
// prettier-ignore
export const singleQuotes = 'a\\b\'"c';
export const controls = "\n\r\t\0\x01";
export const unicodeBraces = "\u{0041}";
export const separator = "X";
export const template = `a\u005cb${separator}c\\d${separator}e\u{005c}f`;
export const literalTemplateEscape = `\\u{0041}${separator}\\n`;
