let quote = 10;
let backslash = 20;
let mixed = 30;
let empty = 40;

export { quote as 'a"b', backslash as "a\\b", mixed as "a\\b'\"c", empty as "" };

export function increment() {
	quote++;
	backslash++;
	mixed++;
	empty++;
	return quote + backslash + mixed + empty;
}
