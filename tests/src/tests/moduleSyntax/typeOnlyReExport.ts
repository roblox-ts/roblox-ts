import type Value = require("./typeOnlyValue");

export { Value };
export default Value;

let value = 1;
export { value as live };
export type { value as hidden };
value = 2;

export function read() {
	return value;
}
