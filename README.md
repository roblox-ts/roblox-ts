<div align="center"><img width=25% src="https://i.imgur.com/yCjHmng.png"></div>
<h1 align="center"><a href="https://roblox-ts.com">roblox-ts</a></h1>
<div align="center">A TypeScript-to-Luau Compiler for Roblox</div>
<br>
<div align="center">
	<a href="https://discord.roblox-ts.com"><img src="https://discordapp.com/api/guilds/476080952636997633/embed.png" alt="Discord server" /></a>
	<a href="https://github.com/roblox-ts/roblox-ts/actions"><img src="https://github.com/roblox-ts/roblox-ts/actions/workflows/UnitTests.yml/badge.svg?branch=master" alt="CI Status" /></a>
	<a href="https://codecov.io/gh/roblox-ts/roblox-ts" ><img src="https://codecov.io/gh/roblox-ts/roblox-ts/graph/badge.svg?token=mdt4kQ2tHK"/></a>
	<a href="https://www.npmjs.com/package/roblox-ts"><img src="https://badge.fury.io/js/roblox-ts.svg"></a>
</div>
<div>&nbsp;</div>

## Introduction

**roblox-ts** is an attempt to bridge the abilities of TypeScript to work in a Roblox environment. We break down your code into an abstract syntax tree and emit functionally similar structures in [Luau](https://luau-lang.org/) so that the code behaves the same.

## Quick start & Documentation

Ready to dive in? [Check out the documentation.](https://roblox-ts.com/docs)

## Source maps

Set `compilerOptions.sourceMap` to `true` in `tsconfig.json` to emit a V3 source map beside each compiled file, such as `init.luau.map` or `init.lua.map`. Maps contain the original TypeScript source text and relative filesystem paths with `/` separators. Literal characters in paths, including spaces, `#`, `%`, and Unicode, are preserved.

Generated mappings use column zero for statement starts and block-closing keywords. Expression-level columns are not mapped.

Compiler-generated statements are mapped only when they have a TypeScript syntax anchor. Namespace export assignments inherit the exported declaration's position. Hoists and plugin-generated syntax without an original printer mapping remain unmapped.

Maps update independently of Luau output when `writeOnlyChanged` is enabled. Successful builds remove maps for deleted inputs and remove stale maps when `sourceMap` is disabled. Builds that fail diagnostics preserve existing Luau and map files.

This option produces external JSON files for tools that consume source maps. It does not install a Studio debugger or configure Rojo to synchronize maps. Inline maps and the TypeScript `sourceRoot` and `mapRoot` options are not supported.

## Join the Community!

https://discord.roblox-ts.com

## Games that use roblox-ts

<a href="https://www.roblox.com/games/6872265039"><img width=32.9% src="https://i.imgur.com/S2x5isG.png" /></a><!-- BedWars 11.7B -->
<a href="https://www.roblox.com/games/4872321990"><img width=32.9% src="https://i.imgur.com/pkuQfdG.png" /></a><!-- Islands 2.4B -->
<a href="https://www.roblox.com/games/7711635737"><img width=32.9% src="https://i.imgur.com/lmJLoAx.png" /></a><!-- Emergency Hamburg 1.4B -->
<a href="https://www.roblox.com/games/110829983956014"><img width=32.9% src="https://i.imgur.com/Cf7oLHJ.jpeg" /></a><!-- Anime Card Clash 507.6M -->
<a href="https://www.roblox.com/games/8542259458"><img width=32.9% src="https://i.imgur.com/n6fMYfz.jpeg" /></a><!-- SkyWars 427.6M -->
<a href="https://www.roblox.com/games/11653088948"><img width=32.9% src="https://i.imgur.com/qCAC3d8.png" /></a><!-- Jurassic Blocky 252.5M -->
<a href="https://www.roblox.com/games/3759927663"><img width=32.9% src="https://i.imgur.com/OAmrsuz.png" /></a><!-- Zombie Strike 228.1M -->
<a href="https://www.roblox.com/games/12851888521"><img width=32.9% src="https://i.imgur.com/K8SvYsc.png" /></a><!-- Punch Wall Simulator 180.8M -->
<a href="https://www.roblox.com/games/9759729519"><img width=32.9% src="https://i.imgur.com/n1dye62.png" /></a><!-- All of Us Are Dead 160.8M -->
<a href="https://www.roblox.com/games/8597844216"><img width=32.9% src="https://i.imgur.com/S728lWz.png" /></a><!-- Slither Simulator 142.0M -->
<a href="https://www.roblox.com/games/122802147482832"><img width=32.9% src="https://i.imgur.com/C0Ssu0W.png" /></a><!-- 24 Hours Overnight 77.5M -->
<a href="https://www.roblox.com/games/89874467895766"><img width=32.9% src="https://i.imgur.com/wYK61am.png" /></a><!-- My Tycoon! 45.9M -->
<a href="https://www.roblox.com/games/15798268709"><img width=32.9% src="https://i.imgur.com/ERuCebr.png" /></a><!-- The Sewers 34.8M -->
<a href="https://www.roblox.com/games/841531820"><img width=32.9% src="https://i.imgur.com/KFUgqsV.png" /></a><!-- Deep Space Tycoon 30.8M -->
<a href="https://www.roblox.com/games/13251504936"><img width=32.9% src="https://i.imgur.com/6AyGF1m.png" /></a><!-- Creepy Crawlers 30.6M -->
<a href="https://www.roblox.com/games/12144402492"><img width=32.9% src="https://i.imgur.com/nffggbO.png" /></a><!-- Deadline 23.1M -->
<a href="https://www.roblox.com/games/9611595239"><img width=32.9% src="https://i.imgur.com/qISPda3.png" /></a><!-- Rift Royale 21.2M -->
<a href="https://www.roblox.com/games/8747402506"><img width=32.9% src="https://i.imgur.com/cZsnXms.png" /></a><!-- Prop Hunt 19.7M -->
<a href="https://www.roblox.com/games/5414779423"><img width=32.9% src="https://i.imgur.com/5GTAGqt.png" /></a><!-- Science Simulator 19.2M -->
<a href="https://www.roblox.com/games/9681195418"><img width=32.9% src="https://i.imgur.com/599Tpu0.png" /></a><!-- popper 12.2M -->
<a href="https://www.roblox.com/games/9655469250"><img width=32.9% src="https://i.imgur.com/GXt8rmT.png" /></a><!-- Space War Tycoon 11.4M -->
<a href="https://www.roblox.com/games/84633364434995"><img width=32.9% src="https://i.imgur.com/bL7cnBe.png" /></a><!-- Unnamed Battlegrounds 9.2M -->
<a href="https://www.roblox.com/games/138705998165267"><img width=32.9% src="https://i.imgur.com/TfDGxeN.png" /></a><!-- Plinko Tycoon 7.6M -->
<a href="https://www.roblox.com/games/112751402967553"><img width=32.9% src="https://i.imgur.com/2vMYAJg.png" /></a><!-- My Crop Farm 7.0M -->
<a href="https://www.roblox.com/games/11688361399"><img width=32.9% src="https://i.imgur.com/EDC7xw6.png" /></a><!-- Wealdland Foods 6.8M -->
<a href="https://www.roblox.com/games/84402061711337"><img width=32.9% src="https://i.imgur.com/9GNse44.png" /></a><!-- Vacuum Everything 6.6M -->
<a href="https://www.roblox.com/games/12147220287"><img width=32.9% src="https://i.imgur.com/iD2PKgW.png" /></a><!-- LegacyVerse 6.2M -->
<a href="https://www.roblox.com/games/91664813726836"><img width=32.9% src="https://i.imgur.com/chsMGo1.png" /></a><!-- Go Dig 5.8M -->
<a href="https://www.roblox.com/games/18381234265"><img width=32.9% src="https://i.imgur.com/KJpPZT2.png" /></a><!-- Fashion Stars 4.0M -->
<a href="https://www.roblox.com/games/73950822398272"><img width=32.9% src="https://i.imgur.com/4kClZ8K.png" /></a><!-- Steal A Figure 3.4M -->
<a href="https://www.roblox.com/games/2184151436"><img width=32.9% src="https://i.imgur.com/JSFPTA0.png" /></a><!-- Dungeon Life 2.1M -->
<a href="https://www.roblox.com/games/118799079009085"><img width=32.9% src="https://i.imgur.com/D3XTG90.png" /></a><!-- RNG Dropper Tycoon 2.0M -->
