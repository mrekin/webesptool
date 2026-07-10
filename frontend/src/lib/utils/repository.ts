// Repository type resolution helper. Pure function, no UI/store dependencies.

import type { RepositoryType, SourceInfo } from '$lib/types.js';

/**
 * Resolve the type of the currently selected repository.
 *
 * Looks up the source whose `src` matches `repository` within `sources` and
 * returns its `type`. Returns `undefined` when the repository is not found or
 * has no explicit type — per PRD, auto-meshcore must only trigger on an
 * explicit `type === MESHCORE`.
 *
 * This is the DRY replacement for the inline
 * `$availableSources.find((s) => s.src === $selectionState.repository)?.type`
 * pattern previously duplicated in CustomFirmwareModal.
 */
export function getRepositoryType(
    sources: SourceInfo[],
    repository: string | null
): RepositoryType | undefined {
    return sources.find((s) => s.src === repository)?.type;
}
