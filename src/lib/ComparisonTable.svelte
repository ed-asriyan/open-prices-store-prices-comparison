<script>
  import { fly } from 'svelte/transition';
  import { Store, CheckCircle2, TrendingDown, ExternalLink, Loader2 } from 'lucide-svelte';

  export let comparisonData = [];
  export let selectedStores = [];
  export let totalExpected = 0;
  export let isLoading = false;

  function getMinPrice(prices) {
    return Math.min(...Object.values(prices).map(p => parseFloat(p.price)));
  }

  function formatPrice(priceData) {
    const val = parseFloat(priceData.price).toFixed(2);
    if (priceData.currency === 'USD') return `$${val}`;
    if (priceData.currency === 'EUR') return `€${val}`;
    return `${val} ${priceData.currency}`;
  }
</script>

{#if comparisonData && comparisonData.length > 0}
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <h2 class="font-semibold text-slate-900 flex items-center gap-2">
        <CheckCircle2 class="w-5 h-5 text-green-500" />
        {#if isLoading && totalExpected > 0}
          Loaded {comparisonData.length} of {totalExpected} common items
        {:else}
          Found {comparisonData.length} common items
        {/if}
      </h2>
      {#if isLoading}
        <Loader2 class="w-4 h-4 animate-spin text-slate-400" />
      {/if}
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm whitespace-nowrap">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-200">
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
          {#each comparisonData as row (row.barcode)}
            {@const minPrice = getMinPrice(row.prices)}
            <tr in:fly={{ y: 10, duration: 180 }} class="hover:bg-slate-50/50 transition-colors">
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
                {@const priceVal = parseFloat(priceData.price)}
                {@const isLowest = priceVal === minPrice && selectedStores.length > 1}
                <td class="px-6 py-4">
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
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}
