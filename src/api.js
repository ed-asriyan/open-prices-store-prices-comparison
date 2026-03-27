const OFF_PRICES_API = 'https://prices.openfoodfacts.org/api/v1';
const OFF_WORLD_API = 'https://world.openfoodfacts.org/api/v3';

/**
 * Search for store locations via OSM Nominatim.
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchLocations(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10`
  );
  if (!res.ok) throw new Error('Failed to fetch locations');
  const data = await res.json();

  return data.map(item => ({
    id: `${item.osm_type.toUpperCase()}-${item.osm_id}`,
    osm_id: item.osm_id,
    osm_type: item.osm_type.toUpperCase(),
    name:
      item.name ||
      (item.address &&
        (item.address.supermarket || item.address.shop || item.address.amenity)) ||
      'Unnamed Store',
    address: item.display_name,
    city:
      item.address &&
      (item.address.city || item.address.town || item.address.village),
  }));
}

/**
 * Fetch all price entries for a given store from Open Prices API.
 * @param {{ osm_id: string|number, osm_type: string, name: string }} store
 * @returns {Promise<Array>}
 */
export async function fetchStorePrices(store) {
  const res = await fetch(
    `${OFF_PRICES_API}/prices?location_osm_id=${store.osm_id}&location_osm_type=${store.osm_type}&size=1000`
  );
  if (!res.ok) throw new Error(`Failed to fetch prices for location ${store.name}`);
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.warn(`Store ${store.name} has no prices in the database.`);
    return [];
  }

  return data.items;
}

/**
 * Fetch product details from Open Food Facts for a list of barcodes.
 * Calls onProgress(current, total) after each request.
 * @param {string[]} barcodes
 * @param {(current: number, total: number) => void} onProgress
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchProductDetailsBatch(barcodes, onProgress) {
  const products = {};
  for (let i = 0; i < barcodes.length; i++) {
    onProgress(i + 1, barcodes.length);
    try {
      const res = await fetch(
        `${OFF_WORLD_API}/product/${barcodes[i]}.json?fields=product_name,image_small_url,brands`
      );
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
}
