const OFF_PRICES_API = 'https://prices.openfoodfacts.org/api/v1';
const OFF_WORLD_API = 'https://world.openfoodfacts.org/api/v3';

const QUEUE_INTERVAL_MS = 1000; // minimum ms between consecutive calls per queue
const MAX_RETRIES = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PREFIX = 'off_cache:';

// ---------------------------------------------------------------------------
// Simple localStorage cache with TTL
// ---------------------------------------------------------------------------

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch (e) {
    // Ignore quota errors — cache is best-effort
    console.warn('Cache write failed:', e);
  }
}

class RateLimitQueue {
  constructor(interval = QUEUE_INTERVAL_MS) {
    this.interval = interval;
    this.queue = [];
    this.running = false;
    this.lastCall = 0;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.running) this._run();
    });
  }

  async _run() {
    this.running = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      const wait = Math.max(0, this.lastCall + this.interval - now);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      const item = this.queue.shift();
      this.lastCall = Date.now();
      try {
        item.resolve(await item.fn());
      } catch (err) {
        item.reject(err);
      }
    }
    this.running = false;
  }
}

async function fetchWithRetry(url) {
  let delay = 2000;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
        delay *= 2;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
    }
    return res;
  }
}

const pricesQueue = new RateLimitQueue();
const productQueue = new RateLimitQueue();

function mapNominatimItem(item) {
  return {
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
  };
}

export async function searchLocations(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10`
  );
  if (!res.ok) throw new Error('Failed to fetch locations');
  const data = await res.json();
  return data.map(mapNominatimItem);
}

/**
 * Resolve store objects from a list of store IDs (e.g. ['NODE-12345', 'WAY-67890'])
 * using the Nominatim lookup endpoint.
 * @param {string[]} storeIds
 * @returns {Promise<Array>}
 */
export async function lookupStoresByIds(storeIds) {
  const typePrefix = { NODE: 'N', WAY: 'W', RELATION: 'R' };
  const osmIds = storeIds.map(id => {
    const dash = id.indexOf('-');
    const type = id.slice(0, dash);
    const osmId = id.slice(dash + 1);
    return `${typePrefix[type] ?? type[0]}${osmId}`;
  }).join(',');

  const res = await fetch(
    `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmIds}&format=json&addressdetails=1`
  );
  if (!res.ok) throw new Error('Failed to look up stores');
  const data = await res.json();
  return data.map(mapNominatimItem);
}

/**
 * Fetch all price entries for a given store from Open Prices API.
 * @param {{ osm_id: string|number, osm_type: string, name: string }} store
 * @returns {Promise<Array>}
 */
export async function fetchStorePrices(store) {
  const cacheKey = `prices:${store.osm_type}:${store.osm_id}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  return pricesQueue.enqueue(async () => {
    const res = await fetchWithRetry(
      `${OFF_PRICES_API}/prices?location_osm_id=${store.osm_id}&location_osm_type=${store.osm_type}&size=1000`
    );
    if (!res.ok) throw new Error(`Failed to fetch prices for location ${store.name}`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      console.warn(`Store ${store.name} has no prices in the database.`);
      cacheSet(cacheKey, []);
      return [];
    }
    cacheSet(cacheKey, data.items);
    return data.items;
  });
}

/**
 * Fetch product details for a list of barcodes using a rate-limited queue.
 * Calls onProgress(current, total) and onProduct(barcode, product) after each fetch.
 * @param {string[]} barcodes
 * @param {(current: number, total: number) => void} onProgress
 * @param {(barcode: string, product: object) => void} onProduct
 * @returns {Promise<void>}
 */
export async function fetchProductDetailsBatch(barcodes, onProgress, onProduct) {
  const total = barcodes.length;
  let completed = 0;

  const promises = barcodes.map(barcode => {
    const cacheKey = `product:${barcode}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      onProduct(barcode, cached);
      completed++;
      onProgress(completed, total);
      return Promise.resolve();
    }

    return productQueue.enqueue(async () => {
      try {
        const res = await fetchWithRetry(
          `${OFF_WORLD_API}/product/${barcode}.json?fields=product_name,image_small_url,brands`
        );
        const product = res.ok ? (await res.json()).product ?? null : null;
        const resolved = product ?? { product_name: 'Unknown Product (Name not in DB)' };
        cacheSet(cacheKey, resolved);
        onProduct(barcode, resolved);
      } catch (err) {
        console.warn(`Failed to fetch product ${barcode}`, err);
        onProduct(barcode, { product_name: 'Unknown Product (Name not in DB)' });
      } finally {
        completed++;
        onProgress(completed, total);
      }
    });
  });

  await Promise.all(promises);
}
