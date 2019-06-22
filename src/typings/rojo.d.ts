interface RojoTreeProperty {
	Type: string;
	Value: any;
}

interface RojoTreeMetadata {
	$className?: string;
	$path?: string;
	$properties?: Array<RojoTreeProperty>;
	$ignoreUnknownInstances?: boolean;
	$isolated?: boolean;
}

type RojoTree = RojoTreeMembers & RojoTreeMetadata;

interface RojoTreeMembers {
	[name: string]: RojoTree;
}

interface RojoFile {
	servePort?: number;
	name: string;
	tree: RojoTree;
}
