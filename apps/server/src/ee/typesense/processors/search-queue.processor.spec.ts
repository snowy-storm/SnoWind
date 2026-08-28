import { QueueJob } from '../../../integrations/queue/constants';
import { SearchQueueProcessor } from './search-queue.processor';

describe('SearchQueueProcessor', () => {
  function createProcessor(driver = 'typesense') {
    const indexer = {
      indexPages: jest.fn(),
      reindexAllPages: jest.fn(),
      removePages: jest.fn(),
      removeBySpace: jest.fn(),
      removeByWorkspace: jest.fn(),
    };
    const processor = new SearchQueueProcessor(
      { getSearchDriver: () => driver } as any,
      indexer as any,
    );
    return { processor, indexer };
  }

  it('does nothing when the search driver is not typesense', async () => {
    const { processor, indexer } = createProcessor('database');
    await processor.process({
      name: QueueJob.PAGE_UPDATED,
      data: { pageIds: ['p1'] },
    } as any);
    expect(indexer.indexPages).not.toHaveBeenCalled();
  });

  it('indexes created, updated and restored pages', async () => {
    const { processor, indexer } = createProcessor();
    await processor.process({
      name: QueueJob.PAGE_UPDATED,
      data: { pageIds: ['p1', 'p2'] },
    } as any);
    expect(indexer.indexPages).toHaveBeenCalledWith(['p1', 'p2']);
  });

  it('removes deleted pages and spaces', async () => {
    const { processor, indexer } = createProcessor();
    await processor.process({
      name: QueueJob.PAGE_SOFT_DELETED,
      data: { pageIds: ['p1'] },
    } as any);
    await processor.process({
      name: QueueJob.SPACE_DELETED,
      data: { spaceId: 'space-1' },
    } as any);

    expect(indexer.removePages).toHaveBeenCalledWith(['p1']);
    expect(indexer.removeBySpace).toHaveBeenCalledWith('space-1');
  });

  it('reindexes every page on a flush job', async () => {
    const { processor, indexer } = createProcessor();
    await processor.process({
      name: QueueJob.TYPESENSE_FLUSH,
      data: {},
    } as any);
    expect(indexer.reindexAllPages).toHaveBeenCalled();
  });
});
