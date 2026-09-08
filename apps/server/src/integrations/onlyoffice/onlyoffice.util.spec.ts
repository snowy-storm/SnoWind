import {
  buildDocumentKey,
  getOnlyOfficeDocumentType,
  isOnlyOfficeFile,
  isPersistableSaveStatus,
  isSameOfficeFamily,
  normalizeFileExt,
  resolveOfficeEditorAccess,
} from './onlyoffice.util';

describe('onlyoffice.util', () => {
  it('normalizes extensions', () => {
    expect(normalizeFileExt('Report.DOCX')).toBe('.docx');
    expect(normalizeFileExt('.xls')).toBe('.xls');
    expect(normalizeFileExt('pptx')).toBe('.pptx');
  });

  it('detects office files by ext and mime', () => {
    expect(isOnlyOfficeFile('notes.docx')).toBe(true);
    expect(isOnlyOfficeFile('.pdf')).toBe(false);
    expect(
      isOnlyOfficeFile(
        'file',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true);
  });

  it('maps document types', () => {
    expect(getOnlyOfficeDocumentType('.doc')).toBe('word');
    expect(getOnlyOfficeDocumentType('book.xlsx')).toBe('cell');
    expect(getOnlyOfficeDocumentType('deck.ppt')).toBe('slide');
    expect(getOnlyOfficeDocumentType('.pdf')).toBeNull();
  });

  it('treats legacy and ooxml as the same family', () => {
    expect(isSameOfficeFamily('.doc', '.docx')).toBe(true);
    expect(isSameOfficeFamily('.xls', '.xlsx')).toBe(true);
    expect(isSameOfficeFamily('.ppt', '.pptx')).toBe(true);
    expect(isSameOfficeFamily('.docx', '.xlsx')).toBe(false);
  });

  it('builds a stable alphanumeric document key', () => {
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const key = buildDocumentKey(
      '11111111-1111-1111-1111-111111111111',
      updatedAt,
    );
    expect(key).toBe(`11111111111111111111111111111111${updatedAt.getTime()}`);
    expect(key).toMatch(/^[0-9a-zA-Z._-]+$/);
  });

  it('treats numeric and string callback statuses as persistable', () => {
    expect(isPersistableSaveStatus(2)).toBe(true);
    expect(isPersistableSaveStatus('2')).toBe(true);
    expect(isPersistableSaveStatus(6)).toBe(true);
    expect(isPersistableSaveStatus('6')).toBe(true);
    expect(isPersistableSaveStatus(1)).toBe(false);
    expect(isPersistableSaveStatus(4)).toBe(false);
  });

  it('keeps save permission when the editor is opened in view mode', () => {
    expect(
      resolveOfficeEditorAccess({ canEditPage: true, mode: 'view' }),
    ).toEqual({ editorCanEdit: false, canSave: true });
    expect(
      resolveOfficeEditorAccess({ canEditPage: true, mode: 'edit' }),
    ).toEqual({ editorCanEdit: true, canSave: true });
    expect(
      resolveOfficeEditorAccess({ canEditPage: false, mode: 'edit' }),
    ).toEqual({ editorCanEdit: false, canSave: false });
  });
});
