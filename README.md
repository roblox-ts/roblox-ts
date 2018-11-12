<div align="center"><img width=25% src="https://i.imgur.com/yCjHmng.png"></div>
<h1 align="center"><a href="https://roblox-ts.github.io/">roblox-ts</a></h1>
<div align="center">A TypeScript-to-Lua Compiler for Roblox</div>
<br>
<div align="center">
	<a href="https://travis-ci.org/roblox-ts/roblox-ts"><img src="https://travis-ci.org/roblox-ts/roblox-ts.svg?branch=master"></a>
	<a href='https://coveralls.io/github/roblox-ts/roblox-ts?branch=master'><img src='https://coveralls.io/repos/github/roblox-ts/roblox-ts/badge.svg?branch=master' alt='Coverage Status' /></a>
	<a href="https://www.npmjs.com/package/roblox-ts"><img src="https://badge.fury.io/js/roblox-ts.svg"></a>
</div>
<div>&nbsp;</div>
<p style="text-align: center;">⚠️ <b>Disclaimer: roblox-ts should only be used for experimental projects until v1.0.0</b> ⚠️</p>

## Why?
As Roblox games become increasingly complex and larger in scope, efficiently writing safe code becomes challenging with Lua. In addition, Lua is difficult to make tooling for. Roblox Studio attempts to provide things like intellisense and autocomplete, but it's mostly just guessing.

**roblox-ts** is designed to solve these problems by compiling TypeScript code directly into Lua, tuned for use in Roblox specifically.

## Goals
*(What we want to do)*
- Provide static type checking for Roblox games.
- Always generate syntactically sound Lua.
- Maintain compatability with TypeScript tooling.
- Allow interoperability between TS<->Lua and Lua<->TS.
- Mirror data type APIs where there is missing functionality in Lua -- and augment data types in the spirit of JavaScript.
- Enable and encourage efficient development workflows.
- Optimize emitted Lua depending on context, but not at the cost of stability.
- Do not introduce unexpected members in the global scope or on user-defined objects.

## Pillars
*(How we'll do it)*
- Stability over complexity.
- Prevent footguns wherever possible. Encourage falling into the pit of success!
- Do not assume developer intention when ambiguity arises.
- Be unopinionated about code style and project structure when feasible.

## Non-goals
*(What we don't want to do*)
- Implement/simulate the entire JavaScript API.
- Interoperability with vanilla TypeScript modules.
- Wrap or rename existing Lua APIs in order to make them more JavaScript-like.
- Take over the world.

# Getting Started

## Installation & Usage

In order to start using roblox-ts, you'll need to have NodeJS and npm installed. [You can download both from here.](https://nodejs.org/)

Next, from your command line install roblox-ts: `npm install -g roblox-ts`\
_(On Unix systems, you may need to prefix this command with `sudo`)_

You can now run roblox-ts with the command `rbxtsc`.

```
Usage: rbxtsc [options]

Options:
  -w, --watch        enable watch mode                                 [boolean]
  -p, --project      project path                                 [default: "."]
  -s, --strict       ensure compiled code is type safe (slower)        [boolean]
  -i, --includePath  folder to copy runtime files to        [default: "include"]
  --noInclude        do not copy runtime files                  [default: false]
  --modulesPath      folder to copy modules to              [default: "modules"]
  -v, --version      show version information                          [boolean]
  -h, --help         show help                                         [boolean]
```

## Project Folder Setup

We recommmend that you write your TypeScript in [VS Code](https://code.visualstudio.com/) for the best experience. However, other editors like [Sublime Text](https://www.sublimetext.com/) and [Atom](https://atom.io/) are supported.

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
		"types": [ "rbx-types" ]
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

More detailed documentation can be found on the [wiki](https://github.com/roblox-ts/roblox-ts/wiki). It is recommended that you peruse through all of the wiki pages as you get started!

# Join the Community!

https://discord.gg/f6Rn6RY

# Credits
roblox-ts is powered by [ts-simple-ast](https://github.com/dsherret/ts-simple-ast) and is inspired by [TypescriptToLua](https://github.com/Perryvw/TypescriptToLua)
