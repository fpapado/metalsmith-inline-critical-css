const path = require('path');
const fs = require('fs');
const multimatch = require('multimatch');
const invariant = require('invariant');
const Purgecss = require('purgecss');
const purgeHtml = require('purgecss-from-html');
const gzipSize = require('gzip-size');
const cheerio = require('cheerio');

// Set up debug
const debug = require('debug')('inline-critical-css-plugin');

/**
 * Expose `plugin`.
 */
module.exports = plugin;

/**
 * Metalsmith plugin to inline critical css, and load the rest asynchronously.
 *
 * @arg cssPublicPath:
 *  The path under which the css is included in the template.
 *  Important for knowing which <link> tag to replace.
 *
 * @return {Function}
 */
function plugin({pattern, cssFile, cssPublicPath} = {}) {
  invariant(!!pattern, 'You must supply a pattern for the html files.');
  invariant(
    !!cssFile && !Array.isArray(cssFile),
    'You must supply a single css file to look for. Multiple files are not currently supported'
  );

  return function(files, metalsmith, done) {
    debug('WILL: Read CSS file', cssFile);
    const cssFilePath = path.resolve(cssFile);
    const cssContent = fs.readFileSync(cssFilePath, {encoding: 'utf-8'});
    debug('OK: Read CSS file');

    // Read the LoadCSS file once
    debug('WILL: Read LoadCSS contents');
    const loadCssPreloadContent = getLoadCSSFallback();
    debug('OK: Read LoadCSS contents');

    // Loop over all the files, applying the transform if matching
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
      .forEach(function(file) {
        debug(`WILL: Run for ${file}`);

        // utf-8 decode read file contents
        debug('WILL: Read html file contents');
        let fileContent = files[file].contents;
        if (!!fileContent && fileContent instanceof Buffer) {
          fileContent = fileContent.toString('utf-8');
        }
        debug('OK: Read html file contents');

        debug('WILL: get used CSS');
        const usedCss = getUsedCss({
          htmlContent: fileContent,
          cssContent: cssContent
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
          loadCssPreloadContent
        });
        debug('OK: inject used CSS to file contents');

        debug('WILL: write to file contents');
        files[file].contents = htmlWithInline;
        debug('OK: write to file contents');

        debug('OK: Critical CSS plugin run');
        done();
      });
  };
}

//
// HELPERS

/**
 * Return only the css from cssContent that is used in htmlContent.
 * Might have false negatives where JS interaction is concerned, but
 * those should be minimal and in any case the full css should come
 * in before that.
 */
const getUsedCss = ({htmlContent, cssContent}) => {
  const purgeCss = new Purgecss({
    content: [
      {
        raw: htmlContent,
        extension: 'html'
      }
    ],
    css: [
      {
        raw: cssContent,
        extension: 'css'
      }
    ],
    extractors: [
      {
        extractor: purgeHtml,
        extensions: ['html']
      }
    ]
  });

  // The result of purgeCss.purge() is an array because of multiple files.
  // We only have one file, so we take the first one.
  const usedCss = purgeCss.purge()[0].css;
  return usedCss;
};

/**
 * Inline Critical CSS in HTML, by replacing <link rel="stylesheet">
 * with a preload tag, adding the critical CSS as <style>, and using
 * loadCSS as a polyfill.
 */
function inlineCriticalCss({
  htmlContent,
  cssPublicPath,
  criticalCssContent,
  loadCssPreloadContent
}) {
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

  // NOTE: .html() returns '' for some reason, so we use toString() instead...
  const linkStylesheet = $link.toString();

  const noscriptFallback = `<noscript>${linkStylesheet}</noscript>`;

  // Fallback for browsers that do not support link rel="preload"
  // @see https://github.com/filamentgroup/loadCSS
  const loadCssPreloadScript = `<script>${loadCssPreloadContent}</script>`;

  /* Add the relevant markup to the page.
   * <link rel="stylesheet"...> ->
   *  <style>.inlined-things{...}</style>
   *  <link rel="preload" href="path/to/mystylesheet.css" as="style" onload="this.rel='stylesheet'">
   *  <noscript><link rel="stylesheet" ...></noscript>
   *  <script>load-css-preload-polyfill</script>
   */
  $link
    .attr({
      rel: 'preload',
      as: 'style',
      // eslint-disable-next-line quotes
      onload: `this.onload=null;this.rel='stylesheet'`
    })
    .before(criticalStyleTag)
    .after(loadCssPreloadScript)
    .after(noscriptFallback);

  const newHtml = $.html();
  return newHtml;
}

/**
 * Inlined cssrelpreload.min.js fallback
 */
function getLoadCSSFallback() {
  return `
!function(t){"use strict";t.loadCSS||(t.loadCSS=function(){});var e=loadCSS.relpreload={};if(e.support=function(){var e;try{e=t.document.createElement("link").relList.supports("preload")}catch(t){e=!1}return function(){return e}}(),e.bindMediaToggle=function(t){function e(){t.media=a}var a=t.media||"all";t.addEventListener?t.addEventListener("load",e):t.attachEvent&&t.attachEvent("onload",e),setTimeout(function(){t.rel="stylesheet",t.media="only x"}),setTimeout(e,3e3)},e.poly=function(){if(!e.support())for(var a=t.document.getElementsByTagName("link"),n=0;n<a.length;n++){var o=a[n];"preload"!==o.rel||"style"!==o.getAttribute("as")||o.getAttribute("data-loadcss")||(o.setAttribute("data-loadcss",!0),e.bindMediaToggle(o))}},!e.support()){e.poly();var a=t.setInterval(e.poly,500);t.addEventListener?t.addEventListener("load",function(){e.poly(),t.clearInterval(a)}):t.attachEvent&&t.attachEvent("onload",function(){e.poly(),t.clearInterval(a)})}"undefined"!=typeof exports?exports.loadCSS=loadCSS:t.loadCSS=loadCSS}("undefined"!=typeof global?global:this);
  `;
}
