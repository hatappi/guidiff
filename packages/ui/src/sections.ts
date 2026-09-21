import type { ReviewPayload } from '@guidiff/schema';
import type { SectionGroup as GenericSectionGroup } from '@guidiff/schema';

export { buildSectionGroups, OTHER_SECTION_ID } from '@guidiff/schema';

export type FileWithState = ReviewPayload['files'][number];
export type SectionGroup = GenericSectionGroup<FileWithState>;
