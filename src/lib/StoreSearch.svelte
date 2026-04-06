<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { Search, MapPin, Loader2, History, X } from 'lucide-svelte';
  import { searchLocations } from '../api.js';

  const dispatch = createEventDispatcher();
  export let historyStores = [];

  let searchTerm = '';
  let searchResults = [];
  let isSearching = false;
  let dropdownOpen = false;
  let containerEl;
  let inputEl;
  let debounceTimer;

  // Reactive debounce: re-run search when searchTerm changes
  $: {
    clearTimeout(debounceTimer);
    if (searchTerm.trim()) {
      debounceTimer = setTimeout(() => doSearch(searchTerm), 400);
    } else {
      searchResults = [];
      isSearching = false;
      dropdownOpen = document.activeElement === inputEl && historyStores.length > 0;
    }
  }

  async function doSearch(query) {
    if (!query.trim()) return;
    isSearching = true;
    try {
      searchResults = await searchLocations(query);
      dropdownOpen = searchResults.length > 0;
    } catch (err) {
      console.error('Location search error:', err);
    } finally {
      isSearching = false;
    }
  }

  function handleSelect(loc) {
    dispatch('add', loc);
    searchTerm = '';
    dropdownOpen = false;
  }

  function handleDeleteHistory(event, storeId) {
    event.preventDefault();
    event.stopPropagation();
    dispatch('removehistory', storeId);
  }

  function openDropdownForCurrentState() {
    if (searchTerm.trim()) {
      dropdownOpen = searchResults.length > 0;
      return;
    }
    dropdownOpen = historyStores.length > 0;
  }

  function handleClickOutside(event) {
    if (containerEl && !containerEl.contains(event.target)) {
      dropdownOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', handleClickOutside);
    clearTimeout(debounceTimer);
  });
</script>

<div class="relative" bind:this={containerEl}>
  <label for="store-search" class="block text-sm font-medium text-slate-700 mb-2">
    Add Store by Address or Name
  </label>
  <div class="relative">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
    <input
      id="store-search"
      type="text"
      class="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
      placeholder="e.g. Trader Joe's Seattle..."
      bind:this={inputEl}
      bind:value={searchTerm}
      on:focus={openDropdownForCurrentState}
      on:click={openDropdownForCurrentState}
    />
    {#if isSearching}
      <Loader2 class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
    {/if}
  </div>

  {#if dropdownOpen && (searchTerm.trim() ? searchResults.length > 0 : historyStores.length > 0)}
    <div class="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-80 overflow-y-auto">
      {#if searchTerm.trim()}
        {#each searchResults as loc (loc.id)}
          <button
            class="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors"
            on:click={() => handleSelect(loc)}
          >
            <MapPin class="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-slate-900">{loc.name || 'Unnamed Store'}</p>
              <p class="text-xs text-slate-500 mt-0.5 line-clamp-1">
                {loc.address || loc.city || `OSM ID: ${loc.osm_id}`}
              </p>
            </div>
          </button>
        {/each}
      {:else}
        {#each historyStores as store (store.id)}
          <button
            class="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start justify-between gap-3 border-b border-slate-50 last:border-0 transition-colors"
            on:click={() => handleSelect(store)}
          >
            <div class="flex items-start gap-3 min-w-0">
              <History class="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div class="min-w-0">
                <p class="font-medium text-slate-900">{store.name || 'Unnamed Store'}</p>
                <p class="text-xs text-slate-500 mt-0.5 line-clamp-1">
                  {store.address || store.city || `OSM ID: ${store.osm_id}`}
                </p>
              </div>
            </div>
            <span
              role="button"
              tabindex="0"
              aria-label={`Delete ${store.name || 'store'} from history`}
              class="text-slate-400 hover:text-red-500 transition-colors p-1"
              on:click={(event) => handleDeleteHistory(event, store.id)}
              on:keydown={(event) => event.key === 'Enter' && handleDeleteHistory(event, store.id)}
            >
              <X class="w-4 h-4" />
            </span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
