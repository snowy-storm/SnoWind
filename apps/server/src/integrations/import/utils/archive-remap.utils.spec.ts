import {
  remapArchiveContent,
  remapCoverPhoto,
  remapBaseCells,
} from './archive-remap.utils';

const pageA = '018f0000-0000-7000-8000-0000000000a1';
const pageB = '018f0000-0000-7000-8000-0000000000a2';
const attOld = '018f0000-0000-7000-8000-0000000000b1';
const attNew = '018f0000-0000-7000-8000-0000000000b2';
const pageNewA = '018f0000-0000-7000-8000-0000000000c1';
const pageNewB = '018f0000-0000-7000-8000-0000000000c2';

describe('archive-remap.utils', () => {
  const pageMap = new Map([
    [pageA, { newPageId: pageNewA, newSlugId: 'slugA' }],
    [pageB, { newPageId: pageNewB, newSlugId: 'slugB' }],
  ]);

  const attachmentMap = new Map([
    [
      attOld,
      { newAttachmentId: attNew, newFileName: 'diagram.drawio.svg' },
    ],
  ]);

  it('remaps image attachmentId and src', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: `/api/files/${attOld}/old.png`,
            attachmentId: attOld,
          },
        },
      ],
    };

    const result: any = remapArchiveContent(content, pageMap, attachmentMap);
    const image = result.content[0];
    expect(image.attrs.attachmentId).toBe(attNew);
    expect(image.attrs.src).toBe(`/api/files/${attNew}/diagram.drawio.svg`);
  });

  it('remaps page mentions and base embeds', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'mention',
              attrs: {
                entityType: 'page',
                entityId: pageA,
                slugId: 'old',
                label: 'A',
              },
            },
          ],
        },
        {
          type: 'base',
          attrs: { pageId: pageB },
        },
      ],
    };

    const result: any = remapArchiveContent(content, pageMap, attachmentMap);
    const mention = result.content[0].content[0];
    expect(mention.attrs.entityId).toBe(pageNewA);
    expect(mention.attrs.slugId).toBe('slugA');
    expect(result.content[1].attrs.pageId).toBe(pageNewB);
  });

  it('remaps drawio and mindmap attachment attrs', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'drawio',
          attrs: {
            src: `/api/files/${attOld}/diagram.drawio.svg`,
            attachmentId: attOld,
          },
        },
        {
          type: 'mindmap',
          attrs: {
            data: JSON.stringify({ root: { data: { text: 'Root' } } }),
            src: `/api/files/${attOld}/mindmap.svg`,
            attachmentId: attOld,
          },
        },
      ],
    };

    const result: any = remapArchiveContent(content, pageMap, attachmentMap);
    expect(result.content[0].attrs.attachmentId).toBe(attNew);
    expect(result.content[1].attrs.attachmentId).toBe(attNew);
    expect(JSON.parse(result.content[1].attrs.data).root.data.text).toBe(
      'Root',
    );
  });

  it('remaps coverPhoto', () => {
    expect(
      remapCoverPhoto(`/api/files/${attOld}/cover.jpg`, attachmentMap),
    ).toBe(`/api/files/${attNew}/diagram.drawio.svg`);
  });

  it('remaps base cells for page and file properties', () => {
    const cells = {
      propPage: pageA,
      propFile: [{ id: attOld, name: 'a.png' }],
    };
    const remapped = remapBaseCells(
      cells,
      [
        { id: 'propPage', type: 'page' },
        { id: 'propFile', type: 'file' },
      ],
      pageMap,
      attachmentMap,
    );
    expect(remapped.propPage).toBe(pageNewA);
    expect((remapped.propFile as any[])[0].id).toBe(attNew);
  });
});
