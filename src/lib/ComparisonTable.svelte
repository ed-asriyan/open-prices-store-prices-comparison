<script>
  import { fly } from 'svelte/transition';
  import { Store, CheckCircle2, TrendingDown, ExternalLink, Loader2 } from 'lucide-svelte';

  export let comparisonData = [];
  export let selectedStores = [];
  export let totalExpected = 0;
  export let isLoading = false;

  function getMinPrice(prices) {
    const vals = Object.values(prices).filter(p => p !== null).map(p => parseFloat(p.price));
    return vals.length ? Math.min(...vals) : null;
  }

  function formatPrice(priceData) {
    const val = parseFloat(priceData.price).toFixed(2);
    if (priceData.currency === 'USD') return `$${val}`;
    if (priceData.currency === 'EUR') return `€${val}`;
    return `${val} ${priceData.currency}`;
  }

  // Compute per-store average price over intersection rows only.
  // Returns { storeId -> avgPrice } and the highest average (most expensive store).
  $: storeAvgPrices = (() => {
    const intersectionRows = (comparisonData ?? []).filter(r => r.inAllStores);
    if (intersectionRows.length === 0 || selectedStores.length < 2) return null;

    const totals = {};
    const counts = {};
    for (const store of selectedStores) {
      totals[store.id] = 0;
      counts[store.id] = 0;
    }
    for (const row of intersectionRows) {
      for (const store of selectedStores) {
        const p = row.prices[store.id];
        if (p) {
          totals[store.id] += parseFloat(p.price);
          counts[store.id]++;
        }
      }
    }

    const avgs = {};
    for (const store of selectedStores) {
      avgs[store.id] = counts[store.id] > 0 ? totals[store.id] / counts[store.id] : null;
    }

    const maxAvg = Math.max(...Object.values(avgs).filter(v => v !== null));
    return { avgs, maxAvg };
  })();
</script>

{#if comparisonData && comparisonData.length > 0}
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <h2 class="font-semibold text-slate-900 flex items-center gap-2">
        <CheckCircle2 class="w-5 h-5 text-green-500" />
        {#if isLoading && totalExpected > 0}
          Loaded {comparisonData.length} of {totalExpected} products
        {:else}
          {comparisonData.length} products · {comparisonData.filter(r => r.inAllStores).length} in all stores
        {/if}
      </h2>
      {#if isLoading}
        <Loader2 class="w-4 h-4 animate-spin text-slate-400" />
      {/if}
    </div>

    <div class="overflow-x-auto max-h-[70vh] overflow-y-auto">
      <table class="w-full text-left text-sm whitespace-nowrap">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
            <th class="md:sticky left-0 z-10 bg-slate-50 px-4 md:px-6 py-4 font-semibold text-slate-700 border-r border-slate-200 w-48 md:w-80 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
              Product
            </th>
            {#each selectedStores as store (store.id)}
              <th class="px-6 py-4 font-semibold text-slate-700 min-w-[160px]">
                <div class="flex flex-col">
                  <span class="truncate max-w-[200px]">{store.name || 'Store'}</span>
                  <span class="text-xs font-normal text-slate-500 truncate max-w-[200px]">
                    {store.city || store.address || ''}
                  </span>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each comparisonData as row, i (row.barcode)}
            {@const minPrice = getMinPrice(row.prices)}
            {#if i > 0 && !row.inAllStores && comparisonData[i - 1].inAllStores}
              <tr>
                <td colspan={selectedStores.length + 1} class="px-6 py-2 bg-slate-50 border-y border-slate-200">
                  <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Only in some stores</span>
                </td>
              </tr>
            {/if}
            <tr in:fly={{ y: 10, duration: 180 }} class="hover:bg-slate-50/50 transition-colors {row.inAllStores ? '' : 'opacity-75'}">
              <td class="md:sticky left-0 z-10 bg-white border-r border-slate-200 px-4 md:px-6 py-4 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                <div class="flex items-center gap-4">
                  {#if row.product.image_small_url}
                    <img
                      src={row.product.image_small_url}
                      alt={row.product.product_name}
                      class="w-12 h-12 rounded-lg object-cover border border-slate-100 bg-slate-50 shrink-0"
                    />
                  {:else}
                    <div class="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                      <Store class="w-5 h-5 text-slate-300" />
                    </div>
                  {/if}
                  <div class="flex flex-col min-w-0">
                    <span class="font-medium text-slate-900 truncate max-w-[120px] md:max-w-none">
                      {row.product.product_name || 'Unnamed Product'}
                    </span>
                    <span class="text-xs text-slate-500 truncate mt-0.5">
                      {row.product.brands ? `${row.product.brands} • ` : ''}{row.barcode}
                    </span>
                    <a
                      href={`https://world.openfoodfacts.org/product/${row.barcode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 font-medium w-fit"
                    >
                      View on OFF <ExternalLink class="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </td>

              {#each selectedStores as store (store.id)}
                {@const priceData = row.prices[store.id]}
                {@const priceVal = priceData ? parseFloat(priceData.price) : null}
                {@const isLowest = priceVal !== null && priceVal === minPrice && selectedStores.length > 1}
                <td class="px-6 py-4">
                  {#if priceData}
                    <div class="flex flex-col">
                      <span class="text-base font-medium flex items-center gap-2 {isLowest ? 'text-green-700' : 'text-slate-900'}">
                        {formatPrice(priceData)}
                        {#if isLowest}
                          <TrendingDown class="w-4 h-4 text-green-600" />
                        {/if}
                      </span>
                      <span class="text-xs text-slate-400 mt-1">
                        {new Date(priceData.date).toLocaleDateString()}
                      </span>
                    </div>
                  {:else}
                    <span class="text-slate-300 text-lg font-light">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>

        {#if storeAvgPrices}
          <tfoot>
            <tr class="border-t-2 border-slate-200 bg-slate-50 sticky bottom-0 z-20">
              <td class="md:sticky left-0 z-30 bg-slate-50 px-4 md:px-6 py-4 border-r border-slate-200 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg. savings vs priciest</span>
              </td>
              {#each selectedStores as store (store.id)}
                {@const avg = storeAvgPrices.avgs[store.id]}
                {@const diff = avg !== null ? storeAvgPrices.maxAvg - avg : null}
                {@const pct = diff !== null && storeAvgPrices.maxAvg > 0 ? (diff / storeAvgPrices.maxAvg) * 100 : null}
                {@const isCheapest = avg !== null && avg === Math.min(...Object.values(storeAvgPrices.avgs).filter(v => v !== null))}
                {@const isMostExpensive = avg !== null && avg === storeAvgPrices.maxAvg}
                <td class="px-6 py-4">
                  {#if pct !== null}
                    <div class="flex flex-col gap-0.5">
                      <span class="text-base font-semibold {isCheapest ? 'text-green-700' : isMostExpensive ? 'text-slate-400' : 'text-slate-700'}">
                        {isMostExpensive ? '—' : `-${pct.toFixed(1)}%`}
                      </span>
                      {#if !isMostExpensive}
                        <span class="text-xs text-slate-400">cheaper on avg</span>
                      {:else}
                        <span class="text-xs text-slate-400">most expensive</span>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-slate-300 text-lg font-light">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          </tfoot>
        {/if}

      </table>
    </div>
  </section>
{/if}
