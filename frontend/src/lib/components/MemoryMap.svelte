<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import type { MemorySegment } from '$lib/types';

    export let totalSize: number;
    export let segments: MemorySegment[];
    export let segmentFill: Map<string, number> | undefined; // filename -> fillFraction 0..1

    // Check for overlapping segments
    function hasOverlaps(seg1: MemorySegment, seg2: MemorySegment): boolean {
        return seg1.address < seg2.address + seg2.size && seg1.address + seg1.size > seg2.address;
    }

    // Handle overlapping segments
    function handleOverlappingSegments(segments: MemorySegment[]): MemorySegment[] {
        const sorted = [...segments].sort((a, b) => a.address - b.address);
        let result: MemorySegment[] = [];

        for (const segment of sorted) {
            // Check for intersections with already-placed segments
            const overlapping = result.filter((prev) => hasOverlaps(segment, prev));

            if (overlapping.length === 0) {
                result.push(segment);
            } else {
                // Overlap: show only the largest segment (by size), marked red (conflict).
                // Smaller overlapping segments are dropped to avoid overlapping blocks and
                // doubled labels on the map. The conflict is still signalled by the red color
                // plus the overlap warning and the FILES_CONFLICT validation.
                const largest = [...overlapping, segment].reduce((max, s) =>
                    s.size > max.size ? s : max
                );
                result = result.filter((prev) => !hasOverlaps(segment, prev));
                result.push({ ...largest, color: '#ef4444' });
            }
        }

        return result;
    }

    // Format file size
    function formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
    }

    // Computed properties
    $: processedSegments = handleOverlappingSegments(segments || []);
    $: hasConflicts = processedSegments.some((seg) => seg.color === '#ef4444');
    $: usedMemory = processedSegments.reduce((sum, seg) => sum + seg.size, 0);
    $: usedPercentage = totalSize > 0 ? (usedMemory / totalSize) * 100 : 0;
</script>

<div class="memory-map-container space-y-3 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
    <!-- Header with size information -->
    <div class="memory-map-header flex items-center justify-between">
        <span class="text-sm font-medium text-orange-300">{$locales('memorymap.layout')}</span>
        <div class="space-x-3 text-xs text-gray-400">
            <span>{$locales('memorymap.total')}: {formatFileSize(totalSize)}</span>
            <span
                >{$locales('memorymap.used')}: {formatFileSize(usedMemory)} ({usedPercentage.toFixed(
                    1
                )}%)</span
            >
        </div>
    </div>

    <!-- Visual memory map -->
    <div class="memory-map-visual space-y-2">
        <!-- Memory bar -->
        <div class="memory-bar relative h-8 overflow-hidden rounded-sm bg-gray-700">
            <!-- Free space -->
            <div class="memory-free absolute inset-0 bg-gray-600"></div>

            <!-- File segments -->
            {#each processedSegments as segment}
                {@const fillFraction = segmentFill?.get(segment.filename) ?? 0}
                <div
                    class="memory-segment absolute flex h-full cursor-pointer items-center justify-center text-xs font-medium text-white transition-all duration-300 hover:z-10 hover:shadow-lg"
                    style="left: {(segment.address / totalSize) * 100}%; width: {Math.max(
                        (segment.size / totalSize) * 100,
                        0.5
                    )}%; background-color: {segment.color};"
                    title="{segment.filename}
{$locales('memorymap.address')}: 0x{segment.address.toString(16).toUpperCase()}
{$locales('memorymap.size')}: {formatFileSize(segment.size)}
{$locales('memorymap.type')}: {segment.type}"
                >
                    {#if (segment.size / totalSize) * 100 > 5}
                        <span class="segment-label relative z-10 truncate px-1">
                            {segment.filename.length > 12
                                ? segment.filename.substring(0, 12) + '...'
                                : segment.filename}
                        </span>
                    {/if}
                    <!-- Progress fill overlay (inside the segment, proportional to the file write fraction) -->
                    {#if segmentFill && fillFraction > 0}
                        <div
                            class="pointer-events-none absolute inset-y-0 left-0 transition-all duration-300"
                            style="width: {Math.min(fillFraction * 100, 100)}%; background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.6) 0 6px, rgba(255, 255, 255, 0) 6px 12px);"
                        ></div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Address labels -->
        <div class="memory-labels flex justify-between font-mono text-xs text-gray-500">
            <span>0x0</span>
            <span>0x{totalSize.toString(16).toUpperCase()}</span>
        </div>
    </div>

    <!-- Legend -->
    <div class="memory-legend flex flex-wrap gap-3">
        <div class="legend-item flex items-center space-x-1">
            <div class="legend-color h-3 w-3 rounded-sm" style="background-color: #fbbf24;"></div>
            <span class="legend-text text-xs text-gray-400">{$locales('memorymap.firmware')}</span>
        </div>
        <div class="legend-item flex items-center space-x-1">
            <div class="legend-color h-3 w-3 rounded-sm" style="background-color: #f59e0b;"></div>
            <span class="legend-text text-xs text-gray-400">{$locales('memorymap.ota')}</span>
        </div>
        <div class="legend-item flex items-center space-x-1">
            <div class="legend-color h-3 w-3 rounded-sm" style="background-color: #84cc16;"></div>
            <span class="legend-text text-xs text-gray-400">{$locales('memorymap.filesystem')}</span
            >
        </div>
        {#if hasConflicts}
            <div class="legend-item flex items-center space-x-1">
                <div
                    class="legend-color h-3 w-3 rounded-sm"
                    style="background-color: #ef4444;"
                ></div>
                <span class="legend-text text-xs text-red-400"
                    >{$locales('memorymap.conflict')}</span
                >
            </div>
        {/if}
    </div>

    <!-- Conflict warning -->
    {#if hasConflicts}
        <div
            class="memory-warning rounded-md border border-red-700/50 bg-red-900/20 p-2 text-xs text-red-400"
        >
            ⚠️ {$locales('memorymap.overlap_warning')}
        </div>
    {/if}

    <!-- Check for files beyond memory limits -->
    {#each processedSegments as segment}
        {#if segment.address + segment.size > totalSize}
            <div
                class="memory-warning rounded-md border border-yellow-700/50 bg-yellow-900/20 p-2 text-xs text-yellow-400"
            >
                ⚠️ {$locales('memorymap.beyond_limits_warning', {
                    values: { filename: segment.filename }
                })}
            </div>
        {/if}
    {/each}
</div>
