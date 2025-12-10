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

// Modal elements
const modal = d3.select("#modal");
const modalTitle = modal.select(".modal-title");
const modalBody = modal.select(".modal-body");
const modalControls = modal.select(".modal-controls");
const closeModalBtn = modal.select(".modal-close");

closeModalBtn.on("click", closeModal);
modal.on("click", (event) => {
  const target = event.target;
  if (target === modal.node() || target.classList.contains("modal-overlay")) {
    closeModal();
  }
});

// ===================== ESCALAS =====================

// Escala de cor em 5 tons de verde
// 0   -> #811b20 (menos bandas, mais escuro)
// 1   -> #f34049 (mais bandas, mais claro)
const colorScale = d3.scaleLinear()
  .domain([0, 0.25, 0.5, 0.75, 1])
  .range([
    "#811b20", // mais escuro
    "#a81a21",
    "#bd1820",
    "#e0222b",
    "#f34049"  // mais claro
  ]);

// Raio mínimo para bolhas sempre visíveis
let countryPaths;
let filteredBands = [];
let countryCounts = new Map();

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
    "Korea": "Republic of Korea",
    "Korea, South": "Republic of Korea",
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
          origin_world: originToWorldName(originMain),
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
  filteredBands = bands
    .filter((d) => (currentDecade === "All" ? true : d.decade === +currentDecade))
    .filter((d) =>
      currentStatus === "all"
        ? true
        : currentStatus === "active"
          ? d.is_active
          : !d.is_active
    )
    .filter((d) =>
      currentSubgenre === "All" ? true : d.styles.includes(currentSubgenre)
    );

  countryCounts = d3.rollup(
    filteredBands,
    (v) => v.length,
    (d) => d.origin_world
  );

  const maxCount = d3.max(countryCounts.values()) || 1;

  countryPaths
    .attr("fill", (d) => {
      const val = countryCounts.get(d.properties.name) || 0;
      const t = val / maxCount;
      return colorScale(t);
    })
    .classed("disabled", (d) => (countryCounts.get(d.properties.name) || 0) === 0)
    .on("mousemove", (event, d) => handleCountryHover(event, d))
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => handleCountryClick(event, d));
}

// ===================== INTERAÇÕES DE PAÍS =====================
function handleCountryHover(event, feature) {
  const countryName = feature.properties.name;
  const count = countryCounts.get(countryName) || 0;

  if (!count) {
    hideTooltip();
    return;
  }

  const label =
    currentSubgenre === "All"
      ? `Bands: ${count}`
      : `${currentSubgenre}: ${count}`;

  tooltip
    .style("opacity", 1)
    .html(`<strong>${countryName}</strong><br/>${label}`)
    .style("left", event.pageX + 14 + "px")
    .style("top", event.pageY - 28 + "px");
}

function handleCountryClick(event, feature) {
  const countryName = feature.properties.name;
  const countryBands = filteredBands.filter((b) => b.origin_world === countryName);

  if (!countryBands.length) return;

  if (currentSubgenre === "All") {
    openSubgenreModal(countryName, countryBands);
  } else {
    openBandListModal(countryName, currentSubgenre, countryBands);
  }
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// ===================== MODAL AUXILIAR =====================
function closeModal() {
  modal.classed("hidden", true);
}

function openModalTable({ title, columns, rows, searchableKeys, statusFilter }) {
  modalTitle.text(title);
  modalBody.html("");
  modalControls.html("");

  const searchInput = modalControls
    .append("input")
    .attr("type", "search")
    .attr("placeholder", "Search...");

  let statusSelect = null;
  if (statusFilter) {
    statusSelect = modalControls
      .append("select")
      .on("change", applyFilters);

    statusSelect
      .selectAll("option")
      .data([
        { label: "All statuses", value: "all" },
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ])
      .join("option")
      .attr("value", (d) => d.value)
      .text((d) => d.label);
  }

  const table = modalBody.append("table");
  const thead = table.append("thead");
  const tbody = table.append("tbody");

  thead
    .append("tr")
    .selectAll("th")
    .data(columns)
    .join("th")
    .text((d) => d.label);

  searchInput.on("input", applyFilters);

  function applyFilters() {
    const term = searchInput.node().value.trim().toLowerCase();
    const statusValue = statusSelect ? statusSelect.node().value : "all";

    const filteredRows = rows.filter((row) => {
      const matchesSearch = !term
        ? true
        : (searchableKeys || columns.map((c) => c.key)).some((key) =>
            String(row[key] || "").toLowerCase().includes(term)
          );

      const matchesStatus = statusSelect
        ? statusValue === "all"
          ? true
          : statusValue === "active"
            ? row.status === "Active"
            : row.status !== "Active"
        : true;

      return matchesSearch && matchesStatus;
    });

    const rowSel = tbody.selectAll("tr").data(filteredRows, (_, i) => i);

    rowSel
      .join("tr")
      .selectAll("td")
      .data((d) => columns.map((col) => d[col.key] ?? ""))
      .join("td")
      .text((d) => d);
  }

  applyFilters();
  modal.classed("hidden", false);
}

function openSubgenreModal(countryName, countryBands) {
  const rows = d3
    .rollups(
      countryBands.flatMap((b) => b.styles.map((style) => ({ style }))),
      (v) => v.length,
      (d) => d.style
    )
    .map(([subgenre, count]) => ({ subgenre, count }))
    .sort((a, b) => d3.descending(a.count, b.count));

  openModalTable({
    title: `${countryName} — bands by subgenre`,
    columns: [
      { key: "subgenre", label: "Subgenre" },
      { key: "count", label: "Bands" },
    ],
    rows,
    searchableKeys: ["subgenre"],
    statusFilter: false,
  });
}

function openBandListModal(countryName, subgenreName, countryBands) {
  const rows = countryBands
    .filter((b) => b.styles.includes(subgenreName))
    .map((b) => ({
      band: b.band_name,
      formed: b.formed_year,
      styles: b.styles.join(", "),
      status: b.is_active ? "Active" : `Inactive (${b.split || ""})`,
    }))
    .sort((a, b) => d3.ascending(a.band, b.band));

  openModalTable({
    title: `${countryName} — ${subgenreName} bands`,
    columns: [
      { key: "band", label: "Band" },
      { key: "formed", label: "Formed" },
      { key: "styles", label: "Styles" },
      { key: "status", label: "Status" },
    ],
    rows,
    searchableKeys: ["band", "styles"],
    statusFilter: true,
  });
}
