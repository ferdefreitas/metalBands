// ===================== CONFIG BÁSICA DO MAPA =====================
const csvFile = "metal_bands_2017(data_cleanDuplicated).csv";

const width = 960;
const height = 520;

const svg = d3
  .select("#map")
  .attr("viewBox", [0, 0, width, height])
  .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g");

// ========= ZOOM (scroll do mouse + arrastar) =========
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
  });

svg.call(zoom);

// Projection ajustado depois com fitSize
const projection = d3.geoNaturalEarth1();
let path = d3.geoPath(projection);

const tooltip = d3.select("#tooltip");

// ===================== ESCALAS =====================

// Escala de cor em 5 tons de verde
// 0   -> #003304 (menos bandas, mais escuro)
// 1   -> #9cff92 (mais bandas, mais claro)
const colorScale = d3.scaleLinear()
  .domain([0, 0.25, 0.5, 0.75, 1])
  .range([
    "#003304", // mais escuro
    "#086c0b",
    "#00b502",
    "#27fb20",
    "#9cff92"  // mais claro
  ]);

// Raio mínimo para bolhas sempre visíveis
const radiusScale = d3.scaleSqrt().range([2, 20]);

let countryPaths;
let bubbleLayer;

// Estado dos filtros
let currentDecade = "All";
let currentStatus = "all";
let currentSubgenre = "All";

// Dados carregados
let bands = [];
let countries = [];
let nameToFeature = new Map();

// ===================== MAPA DE NOMES DE PAÍSES =====================
function originToWorldName(origin) {
  if (!origin) return null;
  const base = origin.trim();
  const map = {
    USA: "United States of America",
    "U.S.A.": "United States of America",
    UK: "United Kingdom",
    Holland: "Netherlands",
    "The Netherlands": "Netherlands",
    UAE: "United Arab Emirates",
    Russia: "Russian Federation",
    "Russian Federation": "Russian Federation",
    "South Korea": "Republic of Korea",
    "North Korea": "Dem. Rep. Korea",
    "Czech Republic": "Czechia",
  };
  return map[base] || base;
}

// ===================== CARREGAR DADOS =====================
Promise.all([
  d3.csv(csvFile, d3.autoType),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
])
  .then(([csvData, world]) => {
    // Processar bandas a partir do CSV original
    bands = csvData
      .map((d) => {
        const formedYear = +d.formed;
        const decade = isFinite(formedYear)
          ? Math.floor(formedYear / 10) * 10
          : null;
        const originMain = (d.origin || "").split(",")[0].trim();
        const styles = (d.style || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const isActive = d.split === "-";

        return {
          ...d,
          formed_year: formedYear,
          decade,
          origin_main: originMain,
          styles,
          is_active: isActive,
        };
      })
      .filter((d) => d.formed_year && !isNaN(d.formed_year));

    // Mapa
    const worldData = topojson.feature(world, world.objects.countries);
    countries = worldData.features;
    nameToFeature = new Map(countries.map((f) => [f.properties.name, f]));

    projection.fitSize([width, height], worldData);
    path = d3.geoPath(projection);

    drawBaseMap();
    populateSubgenreDropdown();
    attachFilterListeners();
    update();
  })
  .catch((err) => console.error("Erro ao carregar dados", err));

// ===================== DESENHAR MAPA BASE =====================
function drawBaseMap() {
  const countriesGroup = g.append("g").attr("class", "countries");

  countryPaths = countriesGroup
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#003304") // cor base (mais escura)
    .attr("stroke", "#000")
    .attr("stroke-width", 0.3);

  // Bolhas por cima
  bubbleLayer = g.append("g").attr("class", "bubble-layer");
}

// ===================== SUBGÊNEROS =====================
function populateSubgenreDropdown() {
  const allSubgenres = Array.from(
    new Set(bands.flatMap((d) => d.styles))
  ).sort(d3.ascending);

  const select = d3.select("#subgenre-select");
  select.append("option").attr("value", "All").text("All subgenres");

  allSubgenres.forEach((s) => {
    select.append("option").attr("value", s).text(s);
  });
}

// ===================== FILTROS =====================
function attachFilterListeners() {
  d3.selectAll('input[name="decade"]').on("change", (e) => {
    currentDecade = e.target.value;
    update();
  });

  d3.selectAll('input[name="status"]').on("change", (e) => {
    currentStatus = e.target.value;
    update();
  });

  d3.select("#subgenre-select").on("change", (e) => {
    currentSubgenre = e.target.value;
    update();
  });
}

// ===================== UPDATE =====================
function update() {
  let filtered = bands.slice();

  if (currentDecade !== "All") {
    filtered = filtered.filter((d) => d.decade === +currentDecade);
  }

  if (currentStatus !== "all") {
    filtered = filtered.filter((d) =>
      currentStatus === "active" ? d.is_active : !d.is_active
    );
  }

  if (currentSubgenre !== "All") {
    filtered = filtered.filter((d) => d.styles.includes(currentSubgenre));
  }

  // Agregar por país
  const countryCounts = d3.rollup(
    filtered,
    (v) => v.length,
    (d) => originToWorldName(d.origin_main)
  );

  const maxCount = d3.max(countryCounts.values()) || 1;

  // MAPA – cor (normaliza 0..maxCount → 0..1)
  countryPaths.attr("fill", (d) => {
    const val = countryCounts.get(d.properties.name) || 0;
    const t = val / maxCount; // 0..1
    return colorScale(t);
  });

  // BOLHAS
  const bubbleData = Array.from(countryCounts, ([name, count]) => {
    const f = nameToFeature.get(name);
    if (!f || !count) return null;
    const [x, y] = path.centroid(f);
    if (isNaN(x) || isNaN(y)) return null;
    return { name, count, x, y };
  }).filter(Boolean);

  radiusScale.domain([0, maxCount]);

  const bubbles = bubbleLayer
    .selectAll("circle.country-bubble")
    .data(bubbleData, (d) => d.name);

  bubbles.join(
    (enter) =>
      enter
        .append("circle")
        .attr("class", "country-bubble")
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y)
        .attr("r", 0)
        .attr("fill", "#9cff92")   // mesma paleta (claro)
        .attr("fill-opacity", 0.7)
        .attr("stroke", "none")    // sem contorno
        .on("mousemove", showTooltip)
        .on("mouseout", hideTooltip)
        .transition()
        .duration(500)
        .attr("r", (d) => radiusScale(d.count)),
    (updateSel) =>
      updateSel
        .on("mousemove", showTooltip)
        .on("mouseout", hideTooltip)
        .transition()
        .duration(500)
        .attr("r", (d) => radiusScale(d.count)),
    (exit) =>
      exit
        .transition()
        .duration(400)
        .attr("r", 0)
        .remove()
  );
}

// ===================== TOOLTIP =====================
function showTooltip(event, d) {
  tooltip
    .style("opacity", 1)
    .html(`<strong>${d.name}</strong><br/>Bands: ${d.count}`)
    .style("left", event.pageX + 14 + "px")
    .style("top", event.pageY - 28 + "px");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}
