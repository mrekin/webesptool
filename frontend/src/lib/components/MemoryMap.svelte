<script lang="ts">
	import { _ as locales } from 'svelte-i18n';
	import type { MemorySegment } from '$lib/types';

	export let totalSize: number;
	export let segments: MemorySegment[];

	// Check for overlapping segments
	function hasOverlaps(seg1: MemorySegment, seg2: MemorySegment): boolean {
		return seg1.address < seg2.address + seg2.size && seg1.address + seg1.size > seg2.address;
	}

	// Handle overlapping segments
	function handleOverlappingSegments(segments: MemorySegment[]): MemorySegment[] {
		const sorted = [...segments].sort((a, b) => a.address - b.address);
		let result: MemorySegment[] = [];

		for (const segment of sorted) {
			// Check for intersections with previous segments
			const overlapWith = result.find(prev => hasOverlaps(segment, prev));

			if (overlapWith) {
				// If there's an intersection, make both segments red
				result = result.map(prev =>
					hasOverlaps(segment, prev) ? { ...prev, color: '#ef4444' } : prev
				);
				result.push({ ...segment, color: '#ef4444' });
			} else {
				result.push(segment);
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
	$: hasConflicts = processedSegments.some(seg => seg.color === '#ef4444');
	$: usedMemory = processedSegments.reduce((sum, seg) => sum + seg.size, 0);
	$: usedPercentage = totalSize > 0 ? (usedMemory / totalSize) * 100 : 0;
</script>

<div class="memory-map-container space-y-3 p-4 border border-gray-700 rounded-lg bg-gray-800/50">
	<!-- Header with size information -->
	<div class="memory-map-header flex justify-between items-center">
		<span class="text-sm font-medium text-orange-300">{$locales('memorymap.layout')}</span>
		<div class="text-xs text-gray-400 space-x-3">
			<span>{$locales('memorymap.total')}: {formatFileSize(totalSize)}</span>
			<span>{$locales('memorymap.used')}: {formatFileSize(usedMemory)} ({usedPercentage.toFixed(1)}%)</span>
		</div>
	</div>

	<!-- Visual memory map -->
	<div class="memory-map-visual space-y-2">
		<!-- Memory bar -->
		<div class="memory-bar relative h-8 bg-gray-700 rounded-sm overflow-hidden">
			<!-- Free space -->
			<div class="memory-free absolute inset-0 bg-gray-600"></div>

			<!-- File segments -->
			{#each processedSegments as segment}
				<div
					class="memory-segment absolute h-full flex items-center justify-center text-xs text-white font-medium transition-all duration-300 hover:z-10 hover:shadow-lg cursor-pointer"
					style="left: {(segment.address / totalSize) * 100}%; width: {Math.max((segment.size / totalSize) * 100, 0.5)}%; background-color: {segment.color};"
					title="{segment.filename}
{$locales('memorymap.address')}: 0x{segment.address.toString(16).toUpperCase()}
{$locales('memorymap.size')}: {formatFileSize(segment.size)}
{$locales('memorymap.type')}: {segment.type}"
				>
					{#if (segment.size / totalSize) * 100 > 5}
						<span class="segment-label truncate px-1">
							{segment.filename.length > 12 ? segment.filename.substring(0, 12) + '...' : segment.filename}
						</span>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Address labels -->
		<div class="memory-labels flex justify-between text-xs text-gray-500 font-mono">
			<span>0x0</span>
			<span>0x{totalSize.toString(16).toUpperCase()}</span>
		</div>
	</div>

	<!-- Legend -->
	<div class="memory-legend flex flex-wrap gap-3">
		<div class="legend-item flex items-center space-x-1">
			<div class="legend-color w-3 h-3 rounded-sm" style="background-color: #fbbf24;"></div>
			<span class="legend-text text-xs text-gray-400">{$locales('memorymap.firmware')}</span>
		</div>
		<div class="legend-item flex items-center space-x-1">
			<div class="legend-color w-3 h-3 rounded-sm" style="background-color: #f59e0b;"></div>
			<span class="legend-text text-xs text-gray-400">{$locales('memorymap.ota')}</span>
		</div>
		<div class="legend-item flex items-center space-x-1">
			<div class="legend-color w-3 h-3 rounded-sm" style="background-color: #84cc16;"></div>
			<span class="legend-text text-xs text-gray-400">{$locales('memorymap.filesystem')}</span>
		</div>
		{#if hasConflicts}
			<div class="legend-item flex items-center space-x-1">
				<div class="legend-color w-3 h-3 rounded-sm" style="background-color: #ef4444;"></div>
				<span class="legend-text text-xs text-red-400">{$locales('memorymap.conflict')}</span>
			</div>
		{/if}
	</div>

	<!-- Conflict warning -->
	{#if hasConflicts}
		<div class="memory-warning rounded-md border border-red-700/50 bg-red-900/20 p-2 text-xs text-red-400">
			⚠️ {$locales('memorymap.overlap_warning')}
		</div>
	{/if}

	<!-- Check for files beyond memory limits -->
	{#each processedSegments as segment}
		{#if segment.address + segment.size > totalSize}
			<div class="memory-warning rounded-md border border-yellow-700/50 bg-yellow-900/20 p-2 text-xs text-yellow-400">
				⚠️ {$locales('memorymap.beyond_limits_warning', { values: { filename: segment.filename } })}
			</div>
		{/if}
	{/each}
</div>