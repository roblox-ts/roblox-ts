<div align="center"><img width=25% src="https://i.imgur.com/yCjHmng.png"></div>
<h1 align="center"><a href="https://roblox-ts.github.io/">roblox-ts</a></h1>
<div align="center">A TypeScript-to-Lua Compiler for Roblox</div>
<br>
<div align="center">
	<a href="https://discord.gg/f6Rn6RY"><img src="https://discordapp.com/api/guilds/476080952636997633/embed.png" alt="Discord server" /></a>
	<a href="https://travis-ci.org/roblox-ts/roblox-ts"><img src="https://travis-ci.org/roblox-ts/roblox-ts.svg?branch=master"></a>
	<a href="https://coveralls.io/github/roblox-ts/roblox-ts?branch=master"><img src="https://coveralls.io/repos/github/roblox-ts/roblox-ts/badge.svg?branch=master" alt="Coverage Status" /></a>
	<a href="https://www.npmjs.com/package/roblox-ts"><img src="https://badge.fury.io/js/roblox-ts.svg"></a>
</div>
<div>&nbsp;</div>
<div align="center">⚠️ <b>Disclaimer: roblox-ts should only be used for experimental projects until v1.0.0</b> ⚠️</div>

## Why?
As Roblox games become increasingly complex and larger in scope, efficiently writing safe code becomes challenging with Lua. In addition, Lua is difficult to make tooling for.

**roblox-ts** is designed to solve these problems by compiling TypeScript code directly into Lua, tuned for use in Roblox specifically.

## How?
**roblox-ts** is an attempt to bridge the abilities of TypeScript to work in a Roblox environment. We break down your code into an abstract syntax tree (via [ts-morph](https://github.com/dsherret/ts-morph)) and emit functionally similar structures in Lua so that the code behaves the same (minus the type information).

## Quick start & Documentation
Ready to dive in? [Check out the documentation.](https://roblox-ts.github.io/docs/)

## Join the Community!
https://discord.gg/f6Rn6RY

## Credits
**roblox-ts** is powered by [ts-morph](https://github.com/dsherret/ts-morph) and is inspired by [TypescriptToLua](https://github.com/Perryvw/TypescriptToLua)

## Games that use roblox-ts
<a href="https://www.roblox.com/games/2184151436/Dungeon-Life-Pre-Alpha"><img width=30% src="https://i.imgur.com/JSFPTA0.png"></a>
