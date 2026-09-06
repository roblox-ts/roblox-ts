interface Values extends ReadonlyArray<any> {}
interface Derived extends Values {}

function first(values: Derived) {
	return values[0];
}
