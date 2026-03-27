<script>
  import { createEventDispatcher } from 'svelte';
  import { Store, X } from 'lucide-svelte';

  export let stores = [];

  const dispatch = createEventDispatcher();
</script>

<div>
  <p class="block text-sm font-medium text-slate-700 mb-2">
    Selected Stores ({stores.length})
  </p>
  <div class="min-h-[52px] flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl border-dashed">
    {#if stores.length === 0}
      <span class="text-sm text-slate-400 italic flex items-center h-full">
        No stores selected yet. Select 2 or more to compare.
      </span>
    {:else}
      {#each stores as store (store.id)}
        <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
          <Store class="w-4 h-4 text-slate-500" />
          <span class="text-sm font-medium">{store.name || `Store #${store.id}`}</span>
          <button
            on:click={() => dispatch('remove', store.id)}
            class="ml-1 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>
