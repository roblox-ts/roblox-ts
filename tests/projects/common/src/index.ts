export interface Named {
	name: string;
}

export class Counter {
	public value = 0;

	public increment() {
		return ++this.value;
	}
}

export let total = 0;
export function add(value: number) {
	total += value;
	return total;
}
