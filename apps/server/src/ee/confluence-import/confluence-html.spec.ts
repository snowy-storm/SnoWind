import { load } from 'cheerio';
import {
  applyConfluenceMacros,
  extractConfluencePage,
  parseConfluenceIndexParentMap,
  resolveConfluenceHref,
  titleFromFileName,
} from './confluence-html';

const PAGE_HTML = `<!DOCTYPE html>
<html>
  <head>
    <title>Child Page - Demo Space</title>
  </head>
  <body>
    <ol id="breadcrumbs">
      <li><a href="index.html">Demo Space</a></li>
      <li><a href="Home_111.html">Home</a></li>
    </ol>
    <h1 id="title-heading"><span id="title-text">Child Page</span></h1>
    <div id="main-content" class="wiki-content">
      <p>Hello Confluence</p>
      <div class="confluence-information-macro confluence-information-macro-warning">
        <span class="confluence-information-macro-icon"></span>
        <div class="confluence-information-macro-body"><p>Watch out</p></div>
      </div>
      <div class="expand-container">
        <div class="expand-control"><span class="expand-control-text">More</span></div>
        <div class="expand-content"><p>Hidden</p></div>
      </div>
      <a href="Home_111.html#section">Home</a>
      <img src="attachments/222/image.png" />
    </div>
    <div id="page-children"></div>
    <div class="pageSection group">
      <div class="pageSectionHeader">
        <h2 id="attachments">Attachments:</h2>
      </div>
      <div class="greybox">
        <a href="attachments/222/333.png?version=1">image.png</a> (image/png)
        <br />
        <a href="attachments/222/diagram.drawio">diagram.drawio</a> (application/vnd.jgraph.mxfile)
      </div>
    </div>
  </body>
</html>`;

const INDEX_HTML = `<div id="content">
  <ul>
    <li>
      <a href="Home_111.html">Home</a>
      <ul>
        <li><a href="Child_222.html">Child Page</a></li>
      </ul>
    </li>
    <li><a href="Other_333.html">Other</a></li>
  </ul>
</div>`;

describe('confluence HTML import', () => {
  it('extracts title, body, breadcrumbs, and attachments', () => {
    const page = extractConfluencePage(PAGE_HTML, 'Child_222.html');

    expect(page.title).toBe('Child Page');
    expect(page.contentHtml).toContain('Hello Confluence');
    expect(page.contentHtml).not.toContain('Attachments:');
    expect(page.breadcrumbParentHref).toBe('Home_111.html');
    expect(page.attachments).toEqual([
      {
        href: 'attachments/222/333.png',
        fileName: 'image.png',
        mimeType: 'image/png',
      },
      {
        href: 'attachments/222/diagram.drawio',
        fileName: 'diagram.drawio',
        mimeType: 'application/vnd.jgraph.mxfile',
      },
    ]);
  });

  it('parses nested page tree from index.html', () => {
    const tree = parseConfluenceIndexParentMap(INDEX_HTML);

    expect(tree.get('Home_111.html')).toBeNull();
    expect(tree.get('Child_222.html')).toBe('Home_111.html');
    expect(tree.get('Other_333.html')).toBeNull();
  });

  it('resolves relative hrefs against known page paths', () => {
    const known = ['Space/Home_111.html', 'Space/Child_222.html'];

    expect(resolveConfluenceHref('Child_222.html', 'Space', known)).toBe(
      'Space/Child_222.html',
    );
    expect(
      resolveConfluenceHref('Home_111.html#section', 'Space', known),
    ).toBe('Space/Home_111.html');
    expect(resolveConfluenceHref('index.html', 'Space', known)).toBeNull();
  });

  it('strips the numeric id from Confluence file names', () => {
    expect(titleFromFileName('My_Page_123456.html')).toBe('My_Page');
  });

  it('converts Confluence macros into editor callouts and details', () => {
    const page = extractConfluencePage(PAGE_HTML, 'Child_222.html');
    const $ = load(page.contentHtml);
    applyConfluenceMacros($, $.root());
    const html = $.root().html() || '';

    expect(html).toContain('data-type="callout"');
    expect(html).toContain('data-callout-type="warning"');
    expect(html).toContain('Watch out');
    expect(html).toContain('<details>');
    expect(html).toContain('data-type="detailsContent"');
    expect(html).toContain('Hidden');
  });
});
