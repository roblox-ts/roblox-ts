const quote = 1;
const backslash = 2;
const newline = 3;
const mixed = 4;
const empty = 5;
const reserved = 6;

export { quote as 'a"b' };
export { backslash as "a\\b" };
export { newline as "line\nbreak" };
export { mixed as "a\\b'\"c" };
export { empty as "" };
export { reserved as "end" };
