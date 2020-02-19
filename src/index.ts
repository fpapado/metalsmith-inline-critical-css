import path from 'path';
import fs from 'fs';
import multimatch from 'multimatch';
import invariant from 'invariant';
import Purgecss from 'purgecss';
import purgeHtml from 'purgecss-from-html';
import gzipSize from 'gzip-size';
import cheerio from 'cheerio';
import debug_ from 'debug';

// Set up debug
const debug = debug_('inline-critical-css-plugin');

export default plugin;

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

/**
 * Metalsmith plugin to inline critical css, and load the rest asynchronously.
 */
function plugin({pattern, cssFile, cssPublicPath}: IOptions) {
  invariant(!!pattern, 'You must supply a pattern for the html files.');
  invariant(
    !!cssFile && !Array.isArray(cssFile),
    'You must supply a single css file to look for. Multiple files are not currently supported.'
  );

  return async function(
    files: Record<string, any>,
    metalsmith: any,
    done: () => void
  ) {
    debug('WILL: Read CSS file', cssFile);
    const cssFilePath = path.resolve(cssFile);
    const cssContent = fs.readFileSync(cssFilePath, {encoding: 'utf-8'});
    debug({cssFilePath, cssContent});
    debug('OK: Read CSS file');

    // Loop over all the files, applying the transform if matching
    await Promise.all(
      Object.keys(files)
        .filter(file => {
          const matches = multimatch(file, pattern).length > 0;

          if (matches) {
            debug(`MATCH: ${file}`);
          } else {
            debug(`NO MATCH: ${file}`);
          }

          return matches;
        })
        .map(async function(file) {
          debug(`WILL: Run for ${file}`);

          // utf-8 decode read file contents
          debug('WILL: Read html file contents');
          let fileContent = files[file].contents;
          if (!!fileContent && fileContent instanceof Buffer) {
            fileContent = fileContent.toString('utf-8');
          }
          debug('OK: Read html file contents');

          debug('WILL: get used CSS');
          debug({fileContent, cssContent});
          const usedCss = await getUsedCss({
            htmlContent: fileContent,
            cssContent: cssContent,
          });
          debug('OK: get used CSS');

          // NOTE: The gzip size will be even smaller when inlined into the document,
          // because the classes are shared
          debug(`Used CSS gzip-size (standalone): ${gzipSize.sync(usedCss)} B`);

          debug('WILL: inject used CSS to file contents');
          const htmlWithInline = inlineCriticalCss({
            htmlContent: fileContent,
            cssPublicPath: cssPublicPath,
            criticalCssContent: usedCss,
          });
          debug('OK: inject used CSS to file contents');

          debug('WILL: write to file contents');
          files[file].contents = htmlWithInline;
          debug('OK: write to file contents');

          debug('OK: Critical CSS plugin run');
        })
    );

    done();
  };
}

//
// HELPERS

interface IPurgeContent {
  htmlContent: string;
  cssContent: string;
}

/**
 * Return only the css from cssContent that is used in htmlContent.
 * Might have false negatives where JS interaction is concerned, but
 * those should be minimal and in any case the full css should come
 * in before that.
 */
const getUsedCss = async ({htmlContent, cssContent}: IPurgeContent) => {
  const purgeCssResults = await new Purgecss().purge({
    content: [
      {
        raw: htmlContent,
        extension: 'html',
      },
    ],
    css: [
      {
        raw: cssContent,
        // extension: 'css',
      },
    ],
    extractors: [
      {
        extractor: purgeHtml as any,
        extensions: ['html'],
      },
    ],
  });

  // The result of purgeCss.purge() is an array because of multiple files.
  // We only have one file, so we take the first one.
  const usedCss = purgeCssResults[0].css;
  return usedCss;
};

interface ICritical {
  htmlContent: string;
  cssPublicPath: string;
  criticalCssContent: string;
}

/**
 * Inline Critical CSS in HTML, by replacing <link rel="stylesheet">
 * with a preload tag, adding the critical CSS as <style>, and using
 * loadCSS as a polyfill.
 */
function inlineCriticalCss({
  htmlContent,
  cssPublicPath,
  criticalCssContent,
}: ICritical) {
  // Set up new markup
  const criticalStyleTag = `<style>${criticalCssContent}</style>`;

  // Get a handle to html root
  const $ = cheerio.load(htmlContent);

  // Find the relevant link tag, under cssPublicPath
  const $link = $('link[rel="stylesheet"]').filter(`[href="${cssPublicPath}"]`);

  // If no relevant link tags found, return the original content
  if ($link.length === 0) {
    debug('Found no link tags with cssPublicPath of ' + cssPublicPath);
    return htmlContent;
  }

  const linkStylesheet = $link.toString();
  const noscriptFallback = `<noscript>${linkStylesheet}</noscript>`;

  /* Change the link tag and add the relevant markup to the page.
   * <link rel="stylesheet"...> ->
   *  <style>.inlined-things{...}</style>
   *  <link rel="stylesheet" href="/path/to/mystylesheet.css" media="print" onload="this.media='all'">
   *  <noscript><link rel="stylesheet" ...></noscript>
   */
  $link
    .attr({
      media: 'print',
      onload: `this.media='all'`,
    })
    .before(criticalStyleTag)
    .after(noscriptFallback);

  const newHtml = $.html();
  return newHtml;
}
