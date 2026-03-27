<script>
  import { onMount } from 'svelte';
  import { Store, Loader2 } from 'lucide-svelte';
  import StoreSearch from './lib/StoreSearch.svelte';
  import SelectedStores from './lib/SelectedStores.svelte';
  import StatusMessage from './lib/StatusMessage.svelte';
  import ComparisonTable from './lib/ComparisonTable.svelte';
  import { fetchStorePrices, fetchProductDetailsBatch, lookupStoresByIds } from './api.js';

  let selectedStores = [];
  let comparisonData = null;
  let totalExpected = 0;
  let status = { isLoading: false, text: '', error: null };

  function syncUrl(stores) {
    const url = new URL(window.location.href);
    if (stores.length > 0) {
      url.searchParams.set('stores', stores.map(s => s.id).join(','));
    } else {
      url.searchParams.delete('stores');
    }
    history.replaceState(null, '', url.toString());
  }

  onMount(async () => {
    const ids = new URLSearchParams(window.location.search).get('stores');
    if (!ids) return;
    const storeIds = ids.split(',').filter(Boolean);
    if (storeIds.length === 0) return;
    status = { isLoading: true, text: 'Restoring stores from link…', error: null };
    try {
      selectedStores = await lookupStoresByIds(storeIds);
      status = { isLoading: false, text: '', error: null };
    } catch (err) {
      console.error(err);
      status = { isLoading: false, text: '', error: 'Could not restore stores from the shared link.' };
    }
  });

  function addStore(event) {
    const store = event.detail;
    if (!selectedStores.find(s => s.id === store.id)) {
      selectedStores = [...selectedStores, store];
      syncUrl(selectedStores);
    }
    comparisonData = null;
  }

  function removeStore(event) {
    const storeId = event.detail;
    selectedStores = selectedStores.filter(s => s.id !== storeId);
    syncUrl(selectedStores);
    comparisonData = null;
  }

  async function runComparison() {
    if (selectedStores.length < 2) return;

    status = { isLoading: true, text: 'Fetching store price datasets...', error: null };
    comparisonData = null;
    totalExpected = 0;

    try {
      // 1. Fetch prices for all selected stores (queued, each goes through rate-limit queue)
      const storesData = await Promise.all(
        selectedStores.map(async store => {
          const prices = await fetchStorePrices(store);
          const priceMap = {};
          prices.forEach(p => {
            if (!priceMap[p.product_code]) priceMap[p.product_code] = p;
          });
          return { storeId: store.id, priceMap };
        })
      );

      // 2. Collect union of all barcodes, flagging which appear in every store
      status = { isLoading: true, text: 'Calculating products...', error: null };

      const allBarcodes = [...new Set(storesData.flatMap(s => Object.keys(s.priceMap)))];
      const intersectingSet = new Set(
        allBarcodes.filter(barcode => storesData.every(s => s.priceMap[barcode] !== undefined))
      );

      if (allBarcodes.length === 0) {
        status = {
          isLoading: false,
          text: '',
          error: 'No products found for the selected stores in the Open Prices database.',
        };
        return;
      }

      // 3. Build price lookup per barcode upfront (undefined for missing stores)
      const pricesByBarcode = {};
      allBarcodes.forEach(barcode => {
        const prices = {};
        storesData.forEach(s => { prices[s.storeId] = s.priceMap[barcode] ?? null; });
        pricesByBarcode[barcode] = prices;
      });

      // intersection first, then partial — each group preserves original order
      const sortedBarcodes = [
        ...allBarcodes.filter(b => intersectingSet.has(b)),
        ...allBarcodes.filter(b => !intersectingSet.has(b)),
      ];

      // 4. Stream results – initialize empty array so table renders immediately
      totalExpected = sortedBarcodes.length;
      comparisonData = [];

      // 5. Fetch product details progressively; UI updates after each item
      await fetchProductDetailsBatch(
        sortedBarcodes,
        (current, total) => {
          status = {
            isLoading: true,
            text: `Fetching product details (${current}/${total})...`,
            error: null,
          };
        },
        (barcode, product) => {
          comparisonData = [
            ...comparisonData,
            {
              barcode,
              product,
              prices: pricesByBarcode[barcode],
              inAllStores: intersectingSet.has(barcode),
            },
          ];
        }
      );

      status = { isLoading: false, text: '', error: null };
    } catch (err) {
      console.error(err);
      status = {
        isLoading: false,
        text: '',
        error: err.message || 'An error occurred while comparing prices.',
      };
    }
  }
</script>

<div class="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
  <div class="max-w-7xl mx-auto space-y-6">

    <!-- Header -->
    <header class="mb-8">
      <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
        <Store class="w-8 h-8 text-blue-600" />
        Grocery Price Comparison
      </h1>
      <p class="text-slate-500 mt-2 max-w-2xl">
        Compare real-time price overlaps between specific grocery stores using data entirely sourced from the Open Food Facts API network.
      </p>
    </header>

    <!-- Store Selector Card -->
    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div class="grid md:grid-cols-2 gap-8">
        <StoreSearch on:add={addStore} />
        <SelectedStores stores={selectedStores} on:remove={removeStore} />
      </div>

      <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
        <p class="text-sm text-slate-500">
          Prices are queried against the community-driven Open Prices database.
        </p>
        <button
          on:click={runComparison}
          disabled={selectedStores.length < 2 || status.isLoading}
          class="px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all
            {selectedStores.length < 2 || status.isLoading
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'}"
        >
          {#if status.isLoading}
            <Loader2 class="w-5 h-5 animate-spin" /> Analyzing...
          {:else}
            Compare Prices
          {/if}
        </button>
      </div>
    </section>

    <!-- Loading / Error -->
    <StatusMessage {status} />

    <!-- Results Table -->
    <ComparisonTable {comparisonData} {selectedStores} {totalExpected} isLoading={status.isLoading} />

  </div>
</div>
