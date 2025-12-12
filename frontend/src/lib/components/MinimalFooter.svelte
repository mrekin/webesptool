<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
</script>

<div class="mt-8 pt-6 border-t border-gray-700">
  <p class="text-center text-xs text-gray-400">
    {@html $locales('footer.trademark_notice')}
  </p>
</div>