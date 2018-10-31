<div align="center"><img width=25% src="https://i.imgur.com/yCjHmng.png"></div>
<h1 align="center">roblox-ts</h1>
<div align="center">A TypeScript-to-Lua Compiler for Roblox</div>
<div>&nbsp;</div>


## Why?
As Roblox games become increasingly complex and larger in size, writing safe code becomes challenging with Lua. In addition, Lua is difficult to make tooling for. Roblox Studio attempts to provide things like intellisense and autocomplete, but it's mostly just guessing.

**roblox-ts** attempts to solve this problem by compiling TypeScript code into Lua code for Roblox usage.

https://roblox-ts.github.io/

# Getting Started

## Installation & Usage

In order to start using roblox-ts, you'll need to have NodeJS and npm installed. [You can download both from here.](https://nodejs.org/)

Next, from your command line install roblox-ts: `npm install -g roblox-ts`\
_(UNIX systems may need you to prefix this command with `sudo`)_

You can now run roblox-ts with the command `rbxtsc`.

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

## Project Folder Setup

We recommmend that you write your TypeScript in [VS Code](https://code.visualstudio.com/) for the best experience. However, also editors like [Sublime Text](https://www.sublimetext.com/) and [Atom](https://atom.io/) are supported.

1. Create a new folder and name it whatever you'd like. For example: `MyCoolProject`

2. Run `npm init -y` inside of your folder. This will create your `package.json` file.

3. Create a folder called `src` to contain your TypeScript files.

4. Create a file named `tsconfig.json` in your project folder. The contents should look like this:
```JSON
{
	"compilerOptions": {
		"outDir": "out",
		"rootDir": "src",
		"module": "commonjs",
		"strict": true,
		"noLib": true,
		"downlevelIteration": true,
		"declaration": false,
		"target": "es6",
		"typeRoots": [ "rbx-types" ]
	},
	"typeAcquisition": {
		"enable": true
	}
}
```
_**(warning: do not change these values unless you know what you are doing!)**_

5. Create a file for syncing your compiled .lua files to Roblox Studio. If you're using Rojo, this should be a `rojo.json` file and look like:
```JSON
{
	"partitions": {
		"include": {
			"path": "include",
			"target": "ReplicatedStorage.RobloxTS.Include"
		},
		"modules": {
			"path": "modules",
			"target": "ReplicatedStorage.RobloxTS.Modules"
		}
	}
}
```
You should add more partitions for the subfolders of your `out` folder.

6. Run `npm install rbx-types` to install the Roblox API type definitions.

7. Start roblox-ts in watch mode `rbxtsc -w`

8. Run your sync program. If you're using Rojo, this is `rojo serve`

9. Write code!

# Join the Community!

https://discord.gg/f6Rn6RY

# Credits
roblox-ts is powered by [ts-simple-ast](https://github.com/dsherret/ts-simple-ast) and is inspired by [TypescriptToLua](https://github.com/Perryvw/TypescriptToLua)
