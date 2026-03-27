import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, X, ExternalLink, Loader2, Store, AlertCircle, CheckCircle2, TrendingDown } from 'lucide-react';

// --- API Constants ---
const OFF_PRICES_API = 'https://prices.openfoodfacts.org/api/v1';
const OFF_WORLD_API = 'https://world.openfoodfacts.org/api/v3';

// --- Helper: Debounce ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function App() {
  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // App State
  const [selectedStores, setSelectedStores] = useState([]);
  const [comparisonData, setComparisonData] = useState(null); // Array of { product: {}, prices: { storeId: price } }
  
  // Progress & Error State
  const [status, setStatus] = useState({ isLoading: false, text: '', error: null });

  const searchRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Location Autocomplete
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }

    const fetchLocations = async () => {
      setIsSearching(true);
      try {
        // Open Prices API /locations endpoint ignores 'q='. 
        // We must query OSM Nominatim to resolve the entity first.
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debouncedSearch)}&format=json&addressdetails=1&limit=10`);
        if (!res.ok) throw new Error('Failed to fetch locations');
        const data = await res.json();
        
        const items = data.map(item => ({
          id: `${item.osm_type.toUpperCase()}-${item.osm_id}`,
          osm_id: item.osm_id,
          osm_type: item.osm_type.toUpperCase(), // 'NODE', 'WAY', or 'RELATION'
          name: item.name || (item.address && (item.address.supermarket || item.address.shop || item.address.amenity)) || 'Unnamed Store',
          address: item.display_name,
          city: item.address && (item.address.city || item.address.town || item.address.village)
        }));
        
        setSearchResults(items); // Keep dropdown manageable
        setDropdownOpen(true);
      } catch (err) {
        console.error("Location search error:", err);
      } finally {
        setIsSearching(false);
      }
    };

    fetchLocations();
  }, [debouncedSearch]);

  const addStore = (store) => {
    if (!selectedStores.find(s => s.id === store.id)) {
      setSelectedStores([...selectedStores, store]);
    }
    setSearchTerm('');
    setDropdownOpen(false);
    setComparisonData(null); // Reset comparison when stores change
  };

  const removeStore = (storeId) => {
    setSelectedStores(selectedStores.filter(s => s.id !== storeId));
    setComparisonData(null);
  };

  // --- Engine Logic ---
  
  const fetchStorePrices = async (store) => {
    // The Open Prices API /prices endpoint filters by location_osm_id and location_osm_type.
    // It ignores "location_id", which is why you were getting the global firehose of random latest items.
    const res = await fetch(`${OFF_PRICES_API}/prices?location_osm_id=${store.osm_id}&location_osm_type=${store.osm_type}&size=1000`);
    if (!res.ok) throw new Error(`Failed to fetch prices for location ${store.name}`);
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      console.warn(`Store ${store.name} has no prices in the database.`);
      return []; 
    }
    
    return data.items;
  };

  const fetchProductDetailsBatch = async (barcodes) => {
    // Batch requests sequentially to avoid hammering the OFF API and getting 429s
    const products = {};
    for (let i = 0; i < barcodes.length; i++) {
      setStatus(prev => ({ ...prev, text: `Fetching product details (${i + 1}/${barcodes.length})...` }));
      try {
        const res = await fetch(`${OFF_WORLD_API}/product/${barcodes[i]}.json?fields=product_name,image_small_url,brands`);
        if (res.ok) {
          const data = await res.json();
          if (data.product) {
            products[barcodes[i]] = data.product;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch product ${barcodes[i]}`, err);
      }
    }
    return products;
  };

  const runComparison = async () => {
    if (selectedStores.length < 2) return;
    
    setStatus({ isLoading: true, text: 'Fetching store price datasets...', error: null });
    setComparisonData(null);

    try {
      // 1. Fetch prices for all selected stores concurrently
      const storesData = await Promise.all(
        selectedStores.map(async (store) => {
          const prices = await fetchStorePrices(store);
          // Create a lookup map: { product_code: price_object }
          const priceMap = {};
          // Take the most recent price if duplicates exist (API usually returns latest first, but just in case)
          prices.forEach(p => {
            if (!priceMap[p.product_code]) priceMap[p.product_code] = p;
          });
          return { storeId: store.id, priceMap };
        })
      );

      // 2. Find intersecting products (present in ALL selected stores)
      setStatus({ isLoading: true, text: 'Calculating intersections...', error: null });
      
      const firstStoreMap = storesData[0].priceMap;
      const intersectingBarcodes = Object.keys(firstStoreMap).filter(barcode => {
        return storesData.every(store => store.priceMap[barcode] !== undefined);
      });

      if (intersectingBarcodes.length === 0) {
        setStatus({ isLoading: false, text: '', error: 'No intersecting products found between these stores based on current Open Prices data.' });
        return;
      }

      // 3. Fetch product details for the intersections
      const productDetailsMap = await fetchProductDetailsBatch(intersectingBarcodes);

      // 4. Construct the final matrix
      const matrix = intersectingBarcodes.map(barcode => {
        const prices = {};
        storesData.forEach(store => {
          prices[store.storeId] = store.priceMap[barcode];
        });

        return {
          barcode,
          product: productDetailsMap[barcode] || { product_name: 'Unknown Product (Name not in DB)' },
          prices
        };
      });

      setComparisonData(matrix);
      setStatus({ isLoading: false, text: '', error: null });

    } catch (err) {
      console.error(err);
      setStatus({ isLoading: false, text: '', error: err.message || 'An error occurred while comparing prices.' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Store className="w-8 h-8 text-blue-600" />
            Grocery Price Intersection
          </h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Compare real-time price overlaps between specific grocery stores using data entirely sourced from the Open Food Facts API network.
          </p>
        </header>

        {/* Store Selector Card */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Search Input */}
            <div className="relative" ref={searchRef}>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Add Store by Address or Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="e.g. Trader Joe's Seattle..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setDropdownOpen(true)}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {dropdownOpen && searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-80 overflow-y-auto">
                  {searchResults.map((loc) => (
                    <button
                      key={loc.id}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors"
                      onClick={() => addStore(loc)}
                    >
                      <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-900">{loc.name || loc.osm_name || 'Unnamed Store'}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {loc.address || loc.osm_display_name || loc.city || `OSM ID: ${loc.osm_id}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Stores List */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Selected Stores ({selectedStores.length})
              </label>
              <div className="min-h-[52px] flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl border-dashed">
                {selectedStores.length === 0 ? (
                  <span className="text-sm text-slate-400 italic flex items-center h-full">
                    No stores selected yet. Select 2 or more to compare.
                  </span>
                ) : (
                  selectedStores.map((store) => (
                    <div key={store.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <Store className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium">{store.name || store.osm_name || `Store #${store.id}`}</span>
                      <button 
                        onClick={() => removeStore(store.id)}
                        className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Prices are queried against the community-driven Open Prices database.
            </p>
            <button
              onClick={runComparison}
              disabled={selectedStores.length < 2 || status.isLoading}
              className={`px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${
                selectedStores.length < 2 || status.isLoading
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {status.isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</>
              ) : (
                'Compare Prices'
              )}
            </button>
          </div>
        </section>

        {/* Status Messaging */}
        {status.isLoading && (
          <div className="flex items-center justify-center p-8 text-blue-600 bg-blue-50/50 rounded-2xl border border-blue-100">
            <Loader2 className="w-6 h-6 animate-spin mr-3" />
            <span className="font-medium animate-pulse">{status.text}</span>
          </div>
        )}

        {status.error && (
          <div className="flex items-center p-4 text-red-700 bg-red-50 rounded-2xl border border-red-100">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0" />
            <span className="font-medium">{status.error}</span>
          </div>
        )}

        {/* Comparison Table */}
        {comparisonData && comparisonData.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Found {comparisonData.length} common items
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="sticky left-0 z-10 bg-slate-50 px-6 py-4 font-semibold text-slate-700 border-r border-slate-200 w-80 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                      Product
                    </th>
                    {selectedStores.map(store => (
                      <th key={store.id} className="px-6 py-4 font-semibold text-slate-700 min-w-[160px]">
                        <div className="flex flex-col">
                          <span className="truncate max-w-[200px]">{store.name || store.osm_name || 'Store'}</span>
                          <span className="text-xs font-normal text-slate-500 truncate max-w-[200px]">
                            {store.city || store.address || ''}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonData.map((row) => {
                    // Calculate lowest price to highlight
                    const pricesArray = Object.values(row.prices).map(p => parseFloat(p.price));
                    const minPrice = Math.min(...pricesArray);

                    return (
                      <tr key={row.barcode} className="hover:bg-slate-50/50 transition-colors">
                        <td className="sticky left-0 z-10 bg-white border-r border-slate-200 px-6 py-4 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                          <div className="flex items-center gap-4">
                            {row.product.image_small_url ? (
                              <img 
                                src={row.product.image_small_url} 
                                alt={row.product.product_name} 
                                className="w-12 h-12 rounded-lg object-cover border border-slate-100 bg-slate-50 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                <Store className="w-5 h-5 text-slate-300" />
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-slate-900 truncate">
                                {row.product.product_name || 'Unnamed Product'}
                              </span>
                              <span className="text-xs text-slate-500 truncate mt-0.5">
                                {row.product.brands ? `${row.product.brands} • ` : ''} {row.barcode}
                              </span>
                              <a 
                                href={`https://world.openfoodfacts.org/product/${row.barcode}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 font-medium w-fit"
                              >
                                View on OFF <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </td>
                        
                        {selectedStores.map(store => {
                          const priceData = row.prices[store.id];
                          const priceVal = parseFloat(priceData.price);
                          const isLowest = priceVal === minPrice && selectedStores.length > 1;

                          return (
                            <td key={store.id} className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className={`text-base font-medium flex items-center gap-2 ${isLowest ? 'text-green-700' : 'text-slate-900'}`}>
                                  {priceData.currency === 'USD' ? '$' : (priceData.currency === 'EUR' ? '€' : '')}
                                  {priceVal.toFixed(2)}
                                  {priceData.currency !== 'USD' && priceData.currency !== 'EUR' ? ` ${priceData.currency}` : ''}
                                  
                                  {isLowest && <TrendingDown className="w-4 h-4 text-green-600" />}
                                </span>
                                <span className="text-xs text-slate-400 mt-1">
                                  {new Date(priceData.date).toLocaleDateString()}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}