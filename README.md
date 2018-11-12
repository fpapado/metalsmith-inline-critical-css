# metalsmith-inline-critical-css

> A Metalsmith plugin to inspect HTML files, inline used selectors from specified CSS, and load the rest asynchronously.

## Motivation
When the browser encounters a `<link rel="stylesheet">` in the `<head>`, it pauses, goes to the network, fetches the file, and only then continues.
This is called "render blocking".
If it sounds bad for performance, it's because it is!
This is especially true for slower networks where the latency alone can add seconds to the request.

To combat this, you can "inline" the used or critical CSS for a page as a `<style>` tag.
You then load the rest asynchronously.
To do that, you link the stylesheet as `<link rel="preload">`, which decouples downloading from execution, and allows the browser to continue.
Once the stylesheet has loaded, it is "swapped in".
To account for browsers that do not support `rel="preload"`, we use the excellent [LoadCSS relpreload.js](https://github.com/filamentgroup/loadcss).

Inlining the critical CSS for a page is one of the most important optimisations you can do to make your site paint faster!

## Quick start

## Options

## Credits, Thanks, Inspiration
