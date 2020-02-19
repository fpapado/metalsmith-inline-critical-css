import plugin from './index';

jest.mock('fs');

describe('base', () => {
  // Mock filesystem for our plugin to read from
  // (it reads the CSS)
  const MOCK_FILE_INFO = {
    '/home/fpap/metalsmith-inline-critical-css/index.css': `
    .test {
      color: red;
    }
    .unused {
      color: blue;
    }
    strong {
      font-weight: 600;
    }
    `,
  };

  beforeEach(() => {
    // Set up some mocked out file info before each test
    require('fs').__setMockFiles(MOCK_FILE_INFO);
  });

  test('purges content from html', async () => {
    const inputHtml = `<html>
  <head>
    <link rel="stylesheet" href="index.css" />
  </head>
  <body>
    <p class="test">
      <strong>Hello</strong>
    </p>
  </body>
</html>`;

    const metalsmithFiles = {
      'index.html': {
        contents: inputHtml,
      },
    };

    const done = new Promise((resolve, reject) => {
      const output = plugin({
        pattern: '*.html',
        cssFile: 'index.css',
        cssPublicPath: 'index.css',
      })(metalsmithFiles, {}, resolve);
    });

    await done;

    const expectedHtml = `<html><head>
    <style>
    .test {
      color: red;
    }
    strong {
      font-weight: 600;
    }
    </style><link rel="stylesheet" href="index.css" media="print" onload="this.media=&apos;all&apos;">
  </head>
  <body>
    <p class="test">
      <strong>Hello</strong>
    </p>
  
</body></html>`;
    expect(metalsmithFiles['index.html'].contents).toEqual(expectedHtml);
  });
});
