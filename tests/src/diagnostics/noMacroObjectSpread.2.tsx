import Roact from "@rbxts/roact";

interface ComponentProps extends Array<number> {}

function Component(props: ComponentProps) {
	return <frame />;
}

const e = <Component {...[123]} />;
