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

Use this in your metalsmith pipeline:

```js
const fs = require('fs');
const path = require('path');
const metalsmith = require('metalsmith');
const criticalCss = require('metalsmith-inline-critical-css');

const INPUT_DIR = '_site/';
const OUTPUT_DIR = '_site/';

function main() {
  // Run metalsmith pipeline
  metalsmith(process.cwd())
    .source(INPUT_DIR) // source directory
    .destination(OUTPUT_DIR) // destination directory
    .clean(false) // clean destination before
    .use(
      criticalCss({
        // Files to run against
        pattern: '**/*.html',
        // The CSS file whose selectors will be matched against the html
        cssFile: path.join(INPUT_DIR, hashedCssFilename),
        // The path under which the css is included in the template files
        cssPublicPath: hashedCssFilename,
      })
    )
    .build(function(err) {
      if (err) {
        console.log('Error running the metalsmith pipeline: ' + err);
        throw err;
      }
      console.log('Done!');
    });
}

main();
```

## Options

```ts
interface IOptions {
  /** A multimatch pattern of files to run on. */
  pattern: string;

  /** The name of the css file in the metalsmith data. */
  cssFile: string;

  /**
   * The path under which the css is included in the template.
   * Important for knowing which <link> tag to replace.
   */
  cssPublicPath: string;
}
```

## Credits, Thanks, Inspiration

Thanks to Filament Group for their work on Load CSS!
