<h1 align="center">roblox-ts</h1>
<div align="center">A TypeScript compiler for Roblox</div>

⚠️ Documentation is a work in progress. ⚠️

## **Quickstart Guide**

### **Installation**
You can install roblox-ts with npm, simply just:\
`npm install -g roblox-ts`\
(some systems may require you to prefix this with `sudo`)\
You can then use roblox-ts via the CLI command `rbxtsc`.

### **Command Line Options**
The `rbxtsc` command has a few flags you can use with it
```
Usage: rbxtsc [options]

Options:
  -w, --watch        enable watch mode                                 [boolean]
  -p, --project      project path                                 [default: "."]
  -i, --includePath  folder to copy runtime .lua files to   [default: "include"]
  --noInclude        do not copy runtime .lua files             [default: false]
  -v, --version      show version information                          [boolean]
  -h, --help         show help                                         [boolean]
```

The `--includePath` flag defaults to "./include"\
You should provide it a path to the folder you want to use for the included runtime library files.\
This path should sync into studio as a folder at `game.ReplicatedStorage.RobloxTS`.

It's recommended this sits outside of your rootDir.

Upon compiling, roblox-ts will attempt to remove any unrecognized .lua files from your "out" folder.
This prevents dangling .lua files from deleted .ts files.

### **Project Setup**

We recommend that you should have your project directory resemble something like:
```
ProjectFolderName
	src/
		ServerScriptService/
			HelloWorld.server.ts
		roblox.d.ts
	out/
	tsconfig.json
```

and your `tsconfig.json` file should resemble something like this:
```JSON
{
	"compilerOptions": {
		"outDir": "out",
		"rootDir": "src",
		"baseUrl": "src",
		"module": "commonjs",
		"strict": true,
		"noLib": true,
		"downlevelIteration": true,
		"declaration": false
	},
	"typeAcquisition": {
		"enable": true
	}
}
```

Compiled .lua files will be placed into the `out` directory.

### **Syncing Files into Roblox Studio**
We recommend you use a tool like [Rojo](https://github.com/LPGhatguy/rojo) or
[rofresh](https://github.com/osyrisrblx/rofresh) to sync your compiled .lua files into studio.
You should point your sync tool at the `out` directory in your project folder.


## **Join the community!**
https://discord.gg/f6Rn6RY
