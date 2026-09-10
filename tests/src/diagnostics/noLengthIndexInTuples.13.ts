type Pair = [number, number];
interface NamedPair extends Pair {}

function readLength(value: NamedPair) {
	value.length;
}

readLength([1, 2]);
