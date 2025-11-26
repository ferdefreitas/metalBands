# Metal Bands Map

An interactive D3 + TopoJSON visualization that maps metal bands around the world. Use the sidebar to filter by decade, subgenre, and band status. Hover over a country to see totals based on the current filters, and click to open a modal with filterable, searchable tables of the bands by subgenre or within a specific subgenre.

## Dataset
The visualization is powered by `metal_bands_2017(data_cleanDuplicated).csv`, which contains band names, countries, status, and subgenre information.

## Running locally
Serve the static files with Python's built-in HTTP server and open the map in your browser.

```bash
python -m http.server 8000
```

Then visit [http://localhost:8000/metalBands.html](http://localhost:8000/metalBands.html).

> Tip: If you run the server from a different directory, adjust the path to `metalBands.html` accordingly.
