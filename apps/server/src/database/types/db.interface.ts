import { DB } from '@snowind/db/types/db';
import { PageEmbeddings } from '@snowind/db/types/embeddings.types';

export interface DbInterface extends DB {
  pageEmbeddings: PageEmbeddings;
}
