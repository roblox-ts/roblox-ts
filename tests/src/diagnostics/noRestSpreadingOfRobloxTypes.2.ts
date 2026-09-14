interface Direction extends Vector3 {}
interface Velocity extends Direction {}

function copy(velocity: Velocity) {
	const { ...rest } = velocity;
	return rest;
}
