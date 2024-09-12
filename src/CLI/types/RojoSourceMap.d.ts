export interface RojoSourceMap {
	name: string;
	className: string;
	filePaths?: Array<string>;
	children?: Array<RojoSourceMap>;
}
