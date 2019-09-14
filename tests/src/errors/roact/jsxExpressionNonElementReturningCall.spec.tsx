import Roact from "@rbxts/roact";

function testFn() {
	return 20;
}

export const element = <frame>
	{testFn()}
</frame>;
