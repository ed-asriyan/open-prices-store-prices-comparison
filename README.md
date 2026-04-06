# OpenPrices Store Prices Comparison
Compare grocery product prices across real store locations using OpenStreetMap search, [Open Prices](https://prices.openfoodfacts.org) data, and product metadata from Open Food Facts.

## Demo
https://groceryprices.asriyan.me

> [!CAUTION]
> This is a 100% AI-generated app.

## How It Works
The app lets you search for grocery stores through [OpenStreetMap Nominatim](https://nominatim.org), select at least two locations, and then pull each store's available price entries from the Open Prices API. It builds a combined list of products, highlights overlaps between stores, and progressively fetches product names, brands, and images from Open Food Facts as results stream into the table. Selected stores are also kept in the URL and local storage so the comparison can be restored on reload.

## Run Locally
Install dependencies:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```

Create a production build:
```bash
npm run build
```

Preview the production build locally:
```bash
npm run preview
```
