<script lang="ts">
	import { _ as locales } from 'svelte-i18n';

	export let isOpen = false;
	export let onClose = () => {};

	// Get current year
	const currentYear = new Date().getFullYear();

	// Generate fireworks
	let fireworks = Array.from({ length: 50 }, (_, i) => ({
		id: i,
		left: Math.random() * 100,
		top: Math.random() * 100,
		delay: Math.random() * 3,
		duration: 2 + Math.random() * 2,
		size: 3 + Math.random() * 5,
		color: ['#ff0', '#f0f', '#0ff', '#f00', '#0f0', '#00f', '#ff8800', '#ff0088'][Math.floor(Math.random() * 8)]
	}));

	function handleClose() {
		onClose();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
		on:click={handleClose}
		on:keydown={(e) => e.key === 'Escape' && handleClose()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div
			class="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-green-600/50 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 shadow-2xl shadow-green-900/50 p-8"
			on:click|stopPropagation
		>
			<!-- Close button -->
			<button
				on:click={handleClose}
				class="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-200"
				aria-label="Close modal"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Fireworks overlay -->
			<div class="pointer-events-none absolute inset-0 overflow-hidden">
				{#each fireworks as firework}
					<div
						class="firework absolute animate-firework"
						style="left: {firework.left}%; top: {firework.top}%; animation-delay: {firework.delay}s; animation-duration: {firework.duration}s;"
					>
						<div
							class="animate-spark"
							style="width: {firework.size}px; height: {firework.size}px; background-color: {firework.color}; box-shadow: 0 0 {firework.size * 2}px {firework.color}, 0 0 {firework.size * 4}px {firework.color};"
						></div>
					</div>
				{/each}
			</div>

			<!-- Content -->
			<div class="relative z-10 flex flex-col items-center justify-center space-y-8 py-8">
				<!-- Large Christmas Tree -->
				<div class="animate-bounce-slow">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-64 w-64 drop-shadow-2xl" viewBox="0 0 200 200">
						<!-- Tree shadow -->
						<ellipse cx="100" cy="195" rx="40" ry="5" fill="rgba(0,0,0,0.3)" />

						<!-- Trunk -->
						<rect x="90" y="165" width="20" height="25" fill="#8B4513" rx="2" />

						<!-- Bottom layer -->
						<polygon points="100,40 30,170 170,170" fill="#228B22" stroke="#1a6b1a" stroke-width="2"/>
						<polygon points="100,40 35,165 165,165" fill="#2d9e2d" />

						<!-- Middle layer -->
						<polygon points="100,55 40,135 160,135" fill="#228B22" stroke="#1a6b1a" stroke-width="2"/>
						<polygon points="100,55 45,130 155,130" fill="#32a332" />

						<!-- Top layer -->
						<polygon points="100,70 50,100 150,100" fill="#228B22" stroke="#1a6b1a" stroke-width="2"/>
						<polygon points="100,70 55,95 145,95" fill="#3cb33c" />

						<!-- Star on top -->
						<polygon
							points="100,20 103,30 113,30 105,37 108,47 100,40 92,47 95,37 87,30 97,30"
							fill="#FFD700"
							class="animate-pulse"
							style="animation-duration: 1s;"
						/>

						<!-- Ornaments -->
						<circle cx="80" cy="140" r="6" fill="#ff4444" class="animate-pulse" style="animation-duration: 1.5s;"/>
						<circle cx="120" cy="135" r="5" fill="#4444ff" class="animate-pulse" style="animation-duration: 1.8s;"/>
						<circle cx="100" cy="110" r="6" fill="#ffff44" class="animate-pulse" style="animation-duration: 1.3s;"/>
						<circle cx="70" cy="105" r="5" fill="#ff44ff" class="animate-pulse" style="animation-duration: 1.6s;"/>
						<circle cx="130" cy="105" r="5" fill="#44ffff" class="animate-pulse" style="animation-duration: 1.4s;"/>
						<circle cx="90" cy="85" r="4" fill="#ff8844" class="animate-pulse" style="animation-duration: 1.7s;"/>
						<circle cx="110" cy="82" r="4" fill="#88ff44" class="animate-pulse" style="animation-duration: 1.5s;"/>

						<!-- Snow on branches -->
						<ellipse cx="60" cy="155" rx="15" ry="3" fill="rgba(255,255,255,0.6)"/>
						<ellipse cx="140" cy="155" rx="15" ry="3" fill="rgba(255,255,255,0.6)"/>
						<ellipse cx="70" cy="120" rx="12" ry="2.5" fill="rgba(255,255,255,0.5)"/>
						<ellipse cx="130" cy="120" rx="12" ry="2.5" fill="rgba(255,255,255,0.5)"/>
						<ellipse cx="80" cy="88" rx="10" ry="2" fill="rgba(255,255,255,0.4)"/>
						<ellipse cx="120" cy="88" rx="10" ry="2" fill="rgba(255,255,255,0.4)"/>
					</svg>
				</div>

				<!-- Greeting text -->
				<div class="text-center space-y-4">
					<h2 class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-red-500 to-green-400 animate-gradient-x">
						🎉 {$locales('footer.new_year_title')} 🎉
					</h2>
					<p class="text-xl text-gray-300">
						{@html $locales('footer.new_year_greeting')}
					</p>
					<p class="text-sm text-gray-400 mt-4">
						{currentYear} ✨
					</p>
				</div>

				<!-- Decorative emoji -->
				<div class="flex gap-4 text-4xl animate-bounce-slow">
					<span class="animate-pulse" style="animation-duration: 1.5s;">🎁</span>
					<span class="animate-pulse" style="animation-duration: 1.3s;">🎄</span>
					<span class="animate-pulse" style="animation-duration: 1.7s;">🎅</span>
					<span class="animate-pulse" style="animation-duration: 1.4s;">⭐</span>
					<span class="animate-pulse" style="animation-duration: 1.6s;">🦌</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes firework {
		0% {
			transform: scale(0);
			opacity: 1;
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 0;
		}
	}

	@keyframes spark {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.5);
		}
	}

	@keyframes bounce-slow {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	@keyframes gradient-x {
		0%, 100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}

	.animate-firework {
		animation: firework var(--duration, 2s) ease-out var(--delay, 0s) infinite;
	}

	.animate-spark {
		animation: spark 0.5s ease-in-out infinite;
		border-radius: 50%;
	}

	.animate-bounce-slow {
		animation: bounce-slow 3s ease-in-out infinite;
	}

	.animate-gradient-x {
		background-size: 200% 200%;
		animation: gradient-x 3s ease infinite;
	}
</style>
