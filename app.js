/**
 * Peta Kepadatan Pusat Aktivitas dan Hubungannya
 * dengan Lokasi Hunian di Kota Bandung
 * ─────────────────────────────────────────────
 * MapLibre GL JS  · Chart.js · Vanilla JS
 */

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const CENTER  = [107.6098, -6.9175];
const BOUNDS  = [[107.45, -7.05], [107.85, -6.72]];
const ZOOM    = 12.2;

const STYLES = {
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  topo:  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
};

/* Layer Definitions */
const LAYERS = [
  {
    id:     'hunian',
    name:   'Kepadatan Hunian',
    short:  'Hunian',
    file:   'Nilai_Hunian_Bandung.geojson',
    type:   'heatmap',          // rendered as heatmap + dots at high zoom
    color:  '#2dd4bf',          // teal
    icon:   '🔥',
    desc:   'Distribusi & kepadatan titik hunian POI seluruh Bandung',
    vis:    true, opacity: 0.80,
    fields: ['name','amenity','shop','operator','opening_hours'],
  },
  {
    id:     'perumahan',
    name:   'Komplek Perumahan',
    short:  'Perumahan',
    file:   'komplek_perumahan.geojson',
    type:   'polygon',
    color:  '#4ade80',          // green
    icon:   '🏘️',
    desc:   '23 area komplek perumahan residensial',
    vis:    true, opacity: 0.75,
    fields: ['name','landuse'],
  },
  {
    id:     'fasilitas',
    name:   'Fasilitas Publik',
    short:  'Fasilitas',
    file:   'titik_fasilitas_permanen.geojson',
    type:   'point',
    color:  '#fbbf24',          // amber
    icon:   '🏥',
    desc:   'Rumah sakit, sekolah, supermarket, klinik',
    vis:    true, opacity: 0.90,
    fields: ['name','amenity','shop','operator','opening_hours','capacity'],
  },
  {
    id:     'mall',
    name:   'Mall & Ritel',
    short:  'Mall',
    file:   'titik_mall.geojson',
    type:   'point',
    color:  '#c084fc',          // violet
    icon:   '🛍️',
    desc:   'Pusat perbelanjaan, mall & supermarket',
    vis:    true, opacity: 0.90,
    fields: ['name','shop','operator','opening_hours'],
  },
  {
    id:     'pendidikan',
    name:   'Institusi Pendidikan',
    short:  'Pendidikan',
    file:   'titik_pendidikan.geojson',
    type:   'point',
    color:  '#60a5fa',          // blue
    icon:   '🎓',
    desc:   'SD-SMA, universitas & politeknik',
    vis:    true, opacity: 0.90,
    fields: ['name','amenity','isced_level','operator','capacity'],
  },
  {
    id:     'jalan',
    name:   'Kepadatan Jalur 3D',
    short:  'Jalur',
    file:   'jalanutama.geojson',
    type:   'road3d',           // special: neon glow + heatmap
    color:  '#fb923c',          // orange
    icon:   '🛣️',
    desc:   'Visualisasi 3D kepadatan jaringan jalan utama',
    vis:    true, opacity: 0.85,
    fields: ['name','highway','oneway','lanes','maxspeed'],
  },
];

/* Field label map (Indonesian) */
const FIELD_LABELS = {
  amenity:'Jenis Fasilitas', shop:'Jenis Toko', name:'Nama',
  operator:'Operator', opening_hours:'Jam Buka', capacity:'Kapasitas',
  landuse:'Penggunaan Lahan', highway:'Tipe Jalan', oneway:'Satu Arah',
  lanes:'Jumlah Lajur', maxspeed:'Kecepatan Maks',
  health_facility_level:'Level Faskes', health_facility_type:'Tipe Faskes',
  staff_count_doctors:'Jumlah Dokter', staff_count_nurses:'Jumlah Perawat',
  health_facility_bed:'Tempat Tidur', isced_level:'Level ISCED',
};

const SKIP_FIELDS = new Set(['osm_id','osm_type','osm_type','geometry',
  'toilets_disposal','toilets_handwashing','medical_system_western',
  'operator_type','access','status','health_facility_level',
  'health_facility_type']);

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
const S = {
  map:        null,
  style:      'dark',
  sidebarTab: 'layers',
  layerData:  {},
  sparkChart: null,
  coords:     { lng:0, lat:0 },
  is3D:       false,
  popupTimer: null,     // cancellable popup timer
  popupClosed: false,   // flag: user explicitly closed popup
};

/* ════════════════════════════════════════════
   DOM HELPERS
════════════════════════════════════════════ */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(msg, type='inf', ms=3200) {
  const c = $('#toasts');
  const el = document.createElement('div');
  const icons = { ok:'✅', err:'❌', inf:'ℹ️' };
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),260); }, ms);
}

/* ════════════════════════════════════════════
   GEOJSON HELPERS
════════════════════════════════════════════ */
/** Filter out features with null name AND no meaningful fields. Also deduplicates by name and clips to boundary. */
function filterNullFeatures(geojson, layer) {
  if (!geojson.features) return geojson;
  const before = geojson.features.length;

  // Step 1: Filter nulls and spatial clip
  geojson.features = geojson.features.filter(f => {
    // 1a. Clip geometries using Turf.js against boundary
    if (f.geometry && typeof turf !== 'undefined' && S.boundaryData) {
      try {
        const poly = S.boundaryData.features ? S.boundaryData.features[0] : S.boundaryData;
        if (poly) {
          if (f.geometry.type === 'Point') {
            if (!turf.booleanPointInPolygon(f, poly)) return false;
          } else {
            if (!turf.booleanIntersects(f, poly)) return false;
          }
        }
      } catch (e) { 
        console.warn('Turf clip error', e); 
        return false; // Exclude data outside or invalid
      }
    }

    // 1b. Filter nulls
    const p = f.properties || {};
    if (p.name && String(p.name).trim()) return true;
    if (layer.type === 'road3d') return true;
    return layer.fields.some(k => p[k] && String(p[k]).trim());
  });

  // Step 2: deduplicate by name (keep first occurrence, skip unnamed)
  if (layer.type !== 'road3d') {
    const seen = new Set();
    geojson.features = geojson.features.filter(f => {
      const name = f.properties?.name;
      if (!name || !String(name).trim()) return true; // keep unnamed
      const key = String(name).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  console.log(`[${layer.id}] filtered+clipped+deduped: ${before} → ${geojson.features.length}`);
  return geojson;
}

/* ════════════════════════════════════════════
   MAP INIT
════════════════════════════════════════════ */
function initMap() {
  S.map = new maplibregl.Map({
    container: 'map',
    style: STYLES.dark,
    center: CENTER, zoom: ZOOM,
    pitch: 0, bearing: 0,
    maxBounds: [[107.35,-7.2],[107.95,-6.6]],
    attributionControl: false,
    antialias: true,
  });

  S.map.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right');
  
  // Add flexible 3D and zoom controls
  S.map.addControl(new maplibregl.NavigationControl({
    visualizePitch: true,
    showZoom: true,
    showCompass: true
  }), 'bottom-right');

  S.map.on('load', async () => {
    await loadAllLayers();
    setupEvents();
    hideLoading();
    updateStats();
    updateCoords();
    // Start road flow animation
    requestAnimationFrame(animateRoadFlow);
  });

  S.map.on('mousemove', e => { S.coords = e.lngLat; updateCoords(); });
  S.map.on('zoom',    updateStats);
  S.map.on('moveend', updateStats);
  S.map.on('pitch', () => {
    const isPitched = S.map.getPitch() > 20;
    S.is3D = isPitched;
    const btn3d = document.getElementById('btn-3d');
    if (btn3d) btn3d.classList.toggle('on', isPitched);
  });
}

/* ════════════════════════════════════════════
   LAYER LOADING
════════════════════════════════════════════ */
async function loadAllLayers() {
  // Boundary FIRST so it can be used for clipping points
  try { await loadBoundary(); } catch(e){ console.warn('Boundary failed to load', e); }

  for (let i=0; i<LAYERS.length; i++) {
    const cfg = LAYERS[i];
    setProgress((i+1) / (LAYERS.length+1));
    try {
      await loadLayer(cfg);
    } catch(e) {
      console.warn(cfg.id, e);
      toast(`Layer "${cfg.name}" gagal dimuat`, 'err');
    }
  }

  setProgress(1);
  buildLegend();
  buildAnalysis();
  toast('Semua layer berhasil dimuat!', 'ok');
}

function setProgress(p) {
  const el = $('.ld-fill');
  if (el) el.style.width = `${Math.round(p*100)}%`;
}

async function loadLayer(cfg) {
  const res = await fetch(cfg.file);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let gj = await res.json();
  gj = filterNullFeatures(gj, cfg);

  const count = gj.features?.length ?? 0;
  S.layerData[cfg.id] = { count, geojson: gj };

  const src = `src-${cfg.id}`;
  const srcOpts = { type: 'geojson', data: gj, generateId: true };

  // Enable clustering for point layers
  if (cfg.type === 'point') {
    srcOpts.cluster = true;
    srcOpts.clusterMaxZoom = 14;
    srcOpts.clusterRadius = 75;
  }
  
  S.map.addSource(src, srcOpts);

  if (cfg.type === 'heatmap')  renderHeatmap(cfg, src);
  else if (cfg.type === 'polygon') renderPolygon(cfg, src);
  else if (cfg.type === 'point')   renderPoint(cfg, src);
  else if (cfg.type === 'road3d')  renderRoad3D(cfg, src);

  updateCount(cfg.id, count);
}

/* ── Heatmap (Kepadatan Hunian) ─────────────── */
function renderHeatmap(cfg, src) {
  const map = S.map;

  // Heatmap layer (zoom 9-14) — subdued, refined
  map.addLayer({
    id: `${cfg.id}-heat`,
    type: 'heatmap',
    source: src,
    minzoom: 8, maxzoom: 15,
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate',['linear'],['zoom'], 8,0.3, 13,1.4],
      'heatmap-radius':    ['interpolate',['linear'],['zoom'], 8,10, 13,22, 15,30],
      'heatmap-color': [
        'interpolate',['linear'],['heatmap-density'],
        0,    'hsla(168,80%,48%,0)',
        0.15, 'hsla(168,80%,48%,0.55)',
        0.4,  'hsla(200,90%,55%,0.7)',
        0.65, 'hsla(45,100%,55%,0.8)',
        0.85, 'hsla(20,100%,55%,0.85)',
        1,    'hsl(350,85%,58%)',
      ],
      'heatmap-opacity': ['interpolate',['linear'],['zoom'], 8,cfg.opacity, 14,cfg.opacity*0.7, 15,0],
    }
  });

  // Dots at high zoom
  map.addLayer({
    id: `${cfg.id}-dot`,
    type: 'circle', source: src, minzoom: 13,
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'circle-radius': ['interpolate',['linear'],['zoom'], 13,3, 17,8],
      'circle-color': cfg.color,
      'circle-opacity': cfg.opacity * 0.75,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.4)',
      'circle-stroke-opacity': cfg.opacity * 0.6,
    }
  });

  bindClick(`${cfg.id}-dot`, cfg);
  bindHover(`${cfg.id}-dot`);
}

/* ── Polygon (Perumahan) ───────────────────── */
function renderPolygon(cfg, src) {
  const map = S.map;

  map.addLayer({
    id: `${cfg.id}-fill`, type:'fill', source: src,
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'fill-color': cfg.color,
      'fill-opacity': cfg.opacity * 0.22,
    }
  });

  map.addLayer({
    id: `${cfg.id}-line`, type:'line', source: src,
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'line-color': cfg.color,
      'line-width': ['interpolate',['linear'],['zoom'], 10,1, 15,2.5],
      'line-opacity': cfg.opacity,
    }
  });

  map.addLayer({
    id: `${cfg.id}-lbl`, type:'symbol', source: src, minzoom: 13,
    layout: {
      visibility: cfg.vis ? 'visible':'none',
      'text-field': ['coalesce',['get','name'],''],
      'text-font':  ['Open Sans Regular','Arial Unicode MS Regular'],
      'text-size': 10, 'text-anchor':'center', 'text-max-width': 8,
    },
    paint: {
      'text-color': cfg.color,
      'text-halo-color': 'rgba(0,0,0,0.75)',
      'text-halo-width': 1.5,
      'text-opacity': cfg.opacity,
    }
  });

  map.on('mouseenter', `${cfg.id}-fill`, ()=>{ map.getCanvas().style.cursor='pointer';
    map.setPaintProperty(`${cfg.id}-fill`,'fill-opacity',cfg.opacity*0.42); });
  map.on('mouseleave', `${cfg.id}-fill`, ()=>{ map.getCanvas().style.cursor='';
    map.setPaintProperty(`${cfg.id}-fill`,'fill-opacity',cfg.opacity*0.22); });
  bindClick(`${cfg.id}-fill`, cfg);
}

/* ── Point (Fasilitas / Mall / Pendidikan) ─── */
function renderPoint(cfg, src) {
  const map = S.map;
  const lid = `${cfg.id}-circle`;
  const clid = `${cfg.id}-cluster`;
  const clbl = `${cfg.id}-cluster-count`;

  // Clusters
  map.addLayer({
    id: clid, type: 'circle', source: src,
    filter: ['has', 'point_count'],
    layout: { visibility: cfg.vis ? 'visible' : 'none' },
    paint: {
      'circle-color': cfg.color,
      'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 15, 24],
      'circle-opacity': cfg.opacity * 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.5)',
    }
  });

  // Cluster count text
  map.addLayer({
    id: clbl, type: 'symbol', source: src,
    filter: ['has', 'point_count'],
    layout: {
      visibility: cfg.vis ? 'visible' : 'none',
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    }
  });

  // Individual points
  map.addLayer({
    id: lid, type: 'circle', source: src,
    filter: ['!', ['has', 'point_count']],
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'circle-radius': ['interpolate',['linear'],['zoom'], 9,3, 12,5.5, 16,11],
      'circle-color': cfg.color,
      'circle-opacity': cfg.opacity,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': 'rgba(255,255,255,0.45)',
      'circle-stroke-opacity': cfg.opacity,
      'circle-blur': 0.05,
    }
  });

  // Zoom in on cluster click
  map.on('click', clid, e => {
    const features = map.queryRenderedFeatures(e.point, { layers: [clid] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource(src).getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 });
    });
  });

  bindHover(lid);
  bindHover(clid);
  bindClick(lid, cfg);
}

/* ── Road 3D (Jalan Utama) ─────────────────── */
function renderRoad3D(cfg, src) {
  const map = S.map;

  // Layer 1: Wide diffuse glow
  map.addLayer({
    id: `${cfg.id}-glow`, type:'line', source: src,
    layout: {
      visibility: cfg.vis ? 'visible':'none',
      'line-cap':'round','line-join':'round',
    },
    paint: {
      'line-color': cfg.color,
      'line-width': ['interpolate',['linear'],['zoom'], 8,6, 12,14, 15,26],
      'line-opacity': ['interpolate',['linear'],['zoom'], 8,0.1, 12,0.18, 15,0.22],
      'line-blur': 8,
    }
  });

  // Layer 2: Medium halo
  map.addLayer({
    id: `${cfg.id}-halo`, type:'line', source: src,
    layout: {
      visibility: cfg.vis ? 'visible':'none',
      'line-cap':'round','line-join':'round',
    },
    paint: {
      'line-color': cfg.color,
      'line-width': ['interpolate',['linear'],['zoom'], 8,2, 12,5, 15,10],
      'line-opacity': ['interpolate',['linear'],['zoom'], 8,0.25, 12,cfg.opacity*0.45, 15,cfg.opacity*0.55],
      'line-blur': 2.5,
    }
  });

  // Layer 3: Sharp neon core
  map.addLayer({
    id: `${cfg.id}-core`, type:'line', source: src,
    layout: {
      visibility: cfg.vis ? 'visible':'none',
      'line-cap':'round','line-join':'round',
    },
    paint: {
      'line-color': '#fff8f0',
      'line-width': ['interpolate',['linear'],['zoom'], 8,0.6, 12,1.5, 15,3],
      'line-opacity': ['interpolate',['linear'],['zoom'], 8,0.3, 12,cfg.opacity*0.6, 15,cfg.opacity],
    }
  });

  // Layer 4: Animated flow dashes
  map.addLayer({
    id: `${cfg.id}-flow`, type:'line', source: src,
    minzoom: 10,
    layout: {
      visibility: cfg.vis ? 'visible':'none',
      'line-cap':'butt','line-join':'round',
    },
    paint: {
      'line-color': 'rgba(45,212,191,0.9)',
      'line-width': ['interpolate',['linear'],['zoom'], 10,1, 13,2, 15,3],
      'line-opacity': ['interpolate',['linear'],['zoom'], 10,0.5, 13,0.85],
      'line-dasharray': [0, 4, 3],
    }
  });

  // Road density heatmap at low zoom
  map.addLayer({
    id: `${cfg.id}-heat`, type:'heatmap', source: src, maxzoom: 11,
    layout: { visibility: cfg.vis ? 'visible':'none' },
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate',['linear'],['zoom'], 5,0.4, 10,1.2],
      'heatmap-radius':    ['interpolate',['linear'],['zoom'], 5,8,  10,16],
      'heatmap-color': [
        'interpolate',['linear'],['heatmap-density'],
        0,   'hsla(25,100%,55%,0)',
        0.2, 'hsla(25,100%,55%,0.5)',
        0.6, 'hsla(38,100%,58%,0.7)',
        1,   'hsl(48,100%,70%)',
      ],
      'heatmap-opacity': cfg.opacity * 0.6,
    }
  });
}

/* ── Boundary ──────────────────────────────── */
async function loadBoundary() {
  const res = await fetch('clipping_boundary.geojson');
  if (!res.ok) return;
  const raw = await res.json();
  const data = (raw.type === 'Feature' || raw.type === 'FeatureCollection')
    ? raw : { type:'Feature', geometry:raw, properties:{} };

  S.boundaryData = data; // Save for Turf clipping

  S.map.addSource('src-boundary', { type:'geojson', data });
  S.map.addLayer({
    id:'boundary-line', type:'line', source:'src-boundary',
    paint: {
      'line-color': 'hsla(220,95%,60%,0.5)',
      'line-width': 2,
      'line-dasharray': [5,4],
      'line-opacity': 0.6,
    }
  });
}

/* ════════════════════════════════════════════
   HOVER & CLICK HELPERS
════════════════════════════════════════════ */
function bindHover(lid) {
  const map = S.map;
  map.on('mouseenter', lid, ()=>{ map.getCanvas().style.cursor='pointer'; });
  map.on('mouseleave', lid, ()=>{ map.getCanvas().style.cursor=''; });
}

function bindClick(lid, cfg) {
  S.map.on('click', lid, e => {
    const f = e.features?.[0];
    if (f) showPopup(f, cfg, e.lngLat);
  });
}

/* ════════════════════════════════════════════
   CLICK RING ANIMATION
════════════════════════════════════════════ */
function spawnClickRings(lngLat) {
  const mapEl = $('#map');
  const pt = S.map.project(lngLat);

  // Remove old rings
  mapEl.querySelectorAll('.click-ring,.click-ring-2,.click-ring-3').forEach(el=>el.remove());

  ['click-ring','click-ring-2','click-ring-3'].forEach(cls => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.left = `${pt.x}px`;
    el.style.top  = `${pt.y}px`;
    mapEl.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  });
}

/* ════════════════════════════════════════════
   3D FLY-TO ON CLICK
════════════════════════════════════════════ */
function flyToFeature(lngLat) {
  S.map.flyTo({
    center: lngLat,
    zoom:   Math.max(S.map.getZoom(), 14.5),
    pitch:  S.is3D ? 58 : 42,
    bearing: (Math.random() - 0.5) * 30,
    duration: 900,
    essential: true,
    easing: t => t < .5 ? 2*t*t : -1+(4-2*t)*t,
  });
}

/* ════════════════════════════════════════════
   POPUP
════════════════════════════════════════════ */
// Global close popup function
function closePopup(e) {
  if (e) e.stopPropagation();
  S.popupClosed = true;
  if (S.popupTimer) { clearTimeout(S.popupTimer); S.popupTimer = null; }
  if (S._onMoveEnd) { S.map.off('moveend', S._onMoveEnd); S._onMoveEnd = null; }
  const popup = $('#popup');
  if (popup) {
    popup.classList.add('off');
    popup.classList.remove('bounce-in');
    setTimeout(() => { if (S.popupClosed) popup.querySelector('.pop-body').innerHTML = ''; }, 250);
  }
  // Reset camera ke 2D mode jika building 3D tidak aktif
  if (!S.buildingsOn && S.map) {
    S.map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }
}

function showPopup(feature, cfg, lngLat) {
  const props = feature.properties || {};
  const popup = $('#popup');

  // Badge
  const badge = popup.querySelector('.pop-badge');
  badge.textContent = `${cfg.icon} ${cfg.short}`;
  badge.style.color = cfg.color;
  badge.style.borderColor = cfg.color;

  // Title
  const title = (props.name && props.name.trim()) ? props.name : cfg.name;
  popup.querySelector('.pop-title').textContent = title;

  // Body
  const body = popup.querySelector('.pop-body');
  body.innerHTML = '';

  const show = cfg.fields.filter(k => {
    const v = props[k];
    return v !== null && v !== undefined && String(v).trim() !== '' && !SKIP_FIELDS.has(k);
  });

  show.forEach(k => {
    const v = props[k];
    const row = document.createElement('div');
    row.className = 'attr-row';
    const label = FIELD_LABELS[k] || k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const numV = parseFloat(v);
    const isNum = !isNaN(numV) && isFinite(numV) && String(v).trim() !== '';
    const isCurr = k.includes('harga') || k.includes('nilai') || k.includes('price');
    let valClass = 'aval';
    let display = String(v);
    if (isCurr && isNum) { valClass='aval currency'; display='Rp '+numV.toLocaleString('id-ID'); }
    else if (isNum)       { valClass='aval num'; display=numV.toLocaleString('id-ID'); }

    row.innerHTML = `<div class="akey">${label}</div><div class="${valClass}">${display}</div>`;
    body.appendChild(row);
  });

  if (body.children.length === 0) {
    body.innerHTML = '<div style="color:var(--tx-3);font-size:11px;">Tidak ada atribut tersedia.</div>';
  }

  // Google Maps link
  const lat = lngLat.lat, lng = lngLat.lng;
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  const existingGmaps = body.querySelector('.gmaps-link');
  if (existingGmaps) existingGmaps.remove();
  const gmapsBtn = document.createElement('a');
  gmapsBtn.className = 'gmaps-link';
  gmapsBtn.href = gmapsUrl;
  gmapsBtn.target = '_blank';
  gmapsBtn.rel = 'noopener noreferrer';
  gmapsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg> Buka di Google Maps`;
  body.appendChild(gmapsBtn);

  // Cancel any pending popup display
  if (S.popupTimer) { clearTimeout(S.popupTimer); S.popupTimer = null; }
  S.popupClosed = false;

  // Rings + fly
  spawnClickRings(lngLat);
  flyToFeature(lngLat);

  // Position helper — called after map settles
  const positionAndShow = () => {
    if (S.popupClosed) return;
    const mapEl = $('#map');
    const rect  = mapEl.getBoundingClientRect();
    const pt    = S.map.project(lngLat);
    const W=272, H=380;
    let l = pt.x + 20, t = pt.y - 60;
    if (l + W > rect.width - 10)  l = pt.x - W - 20;
    if (t < 10)                   t = 10;
    if (t + H > rect.height - 40) t = rect.height - H - 44;
    popup.style.left = `${Math.max(8, l)}px`;
    popup.style.top  = `${Math.max(8, t)}px`;
    popup.classList.remove('off');
    popup.classList.remove('bounce-in');
    void popup.offsetWidth;
    popup.classList.add('bounce-in');
  };

  // Use moveend event — fires when flyTo animation completes (most reliable)
  let moveendFired = false;
  
  // Cleanup any existing listener before adding a new one
  if (S._onMoveEnd) { S.map.off('moveend', S._onMoveEnd); }

  S._onMoveEnd = () => {
    moveendFired = true;
    if (S.popupTimer) { clearTimeout(S.popupTimer); S.popupTimer = null; }
    S.popupTimer = setTimeout(() => { S.popupTimer = null; positionAndShow(); }, 80);
    S._onMoveEnd = null;
  };
  S.map.once('moveend', S._onMoveEnd);

  // Fallback timer in case moveend fires late or not at all
  S.popupTimer = setTimeout(() => {
    if (!moveendFired) {
      if (S._onMoveEnd) { S.map.off('moveend', S._onMoveEnd); S._onMoveEnd = null; }
      positionAndShow();
    }
  }, 1100);
}

/* ════════════════════════════════════════════
   LAYER VISIBILITY & OPACITY
════════════════════════════════════════════ */
function getSubLayers(id, type) {
  if (type === 'heatmap')  return [`${id}-heat`,`${id}-dot`];
  if (type === 'polygon')  return [`${id}-fill`,`${id}-line`,`${id}-lbl`];
  if (type === 'point')    return [`${id}-circle`,`${id}-cluster`,`${id}-cluster-count`];
  if (type === 'road3d')   return [`${id}-heat`,`${id}-glow`,`${id}-halo`,`${id}-core`,`${id}-flow`];
  return [];
}

function setVis(id, type, visible) {
  const vis = visible ? 'visible' : 'none';
  getSubLayers(id, type).forEach(lid => {
    try { if (S.map.getLayer(lid)) S.map.setLayoutProperty(lid,'visibility',vis); } catch(_){}
  });
  buildLegend();
  updateStats();
}

function setOpacity(cfg, val) {
  cfg.opacity = val;
  const map = S.map;

  if (cfg.type === 'heatmap') {
    if (map.getLayer(`${cfg.id}-heat`))
      map.setPaintProperty(`${cfg.id}-heat`,'heatmap-opacity',
        ['interpolate',['linear'],['zoom'], 8,val, 14,val*0.7, 15,0]);
    if (map.getLayer(`${cfg.id}-dot`))
      map.setPaintProperty(`${cfg.id}-dot`,'circle-opacity', val*0.75);
  }
  if (cfg.type === 'polygon') {
    if (map.getLayer(`${cfg.id}-fill`))  map.setPaintProperty(`${cfg.id}-fill`,'fill-opacity', val*0.22);
    if (map.getLayer(`${cfg.id}-line`))  map.setPaintProperty(`${cfg.id}-line`,'line-opacity', val);
    if (map.getLayer(`${cfg.id}-lbl`))   map.setPaintProperty(`${cfg.id}-lbl`,'text-opacity',  val);
  }
  if (cfg.type === 'point') {
    if (map.getLayer(`${cfg.id}-circle`)) {
      map.setPaintProperty(`${cfg.id}-circle`,'circle-opacity', val);
      map.setPaintProperty(`${cfg.id}-circle`,'circle-stroke-opacity', val);
    }
  }
  if (cfg.type === 'road3d') {
    if (map.getLayer(`${cfg.id}-halo`))
      map.setPaintProperty(`${cfg.id}-halo`,'line-opacity',
        ['interpolate',['linear'],['zoom'], 8,0.25, 12,val*0.45, 15,val*0.55]);
    if (map.getLayer(`${cfg.id}-core`))
      map.setPaintProperty(`${cfg.id}-core`,'line-opacity',
        ['interpolate',['linear'],['zoom'], 8,0.3, 12,val*0.6, 15,val]);
  }
}

/* ════════════════════════════════════════════
   STYLE SWITCHING
════════════════════════════════════════════ */
function switchStyle(key) {
  S.style = key;
  const savedVis = {};
  LAYERS.forEach(l => { savedVis[l.id] = l.vis; });

  // UI
  $$('.stab').forEach(b => b.classList.toggle('on', b.dataset.style === key));
  document.body.classList.toggle('light', key === 'light');

  S.map.setStyle(STYLES[key]);
  S.map.once('styledata', () => {
    LAYERS.forEach(l => { l.vis = savedVis[l.id]; });
    loadAllLayers();
  });
}

/* ════════════════════════════════════════════
   SIDEBAR — LAYER CARDS
════════════════════════════════════════════ */
function buildLayerCards() {
  const container = $('#layers-container') || $('#layers-panel');
  container.innerHTML = '';

  LAYERS.forEach(cfg => {
    const card = document.createElement('div');
    card.className = `layer-card ${cfg.vis ? 'on':''}`;
    card.id = `card-${cfg.id}`;

    card.innerHTML = `
      <div class="lc-head" id="lch-${cfg.id}">
        <span class="lc-dot" style="color:${cfg.color};background:${cfg.color};"></span>
        <span class="lc-name">${cfg.name}</span>
        <span class="lc-badge">${cfg.type === 'road3d' ? '3D' : cfg.type === 'heatmap' ? 'heat' : cfg.type}</span>
        <label class="tog" title="Toggle ${cfg.name}" onclick="event.stopPropagation()">
          <input type="checkbox" id="tog-${cfg.id}" ${cfg.vis ? 'checked':''}>
          <span class="tog-sl"></span>
        </label>
        <span class="lc-chevron" id="chev-${cfg.id}" style="font-size:11px;color:var(--tx-3);transition:transform var(--t-fast)">▼</span>
      </div>
      <div class="lc-count" id="cnt-${cfg.id}">
        <span style="color:var(--tx-3)">Memuat...</span>
      </div>
      <div class="lc-body" id="lcb-${cfg.id}">
        <div class="op-row">
          <span class="op-label">Opasitas</span>
          <input type="range" class="op-slider" id="ops-${cfg.id}"
            min="0" max="1" step="0.05" value="${cfg.opacity}"
            style="--pct:${cfg.opacity*100}%">
          <span class="op-val" id="opv-${cfg.id}">${Math.round(cfg.opacity*100)}%</span>
        </div>
        <div style="font-size:10px;color:var(--tx-3);line-height:1.5;">${cfg.desc}</div>
      </div>
    `;

    // Toggle vis
    card.querySelector(`#tog-${cfg.id}`).addEventListener('change', e => {
      cfg.vis = e.target.checked;
      card.classList.toggle('on', cfg.vis);
      setVis(cfg.id, cfg.type, cfg.vis);
    });

    // Expand
    const head = card.querySelector(`#lch-${cfg.id}`);
    const body = card.querySelector(`#lcb-${cfg.id}`);
    const chev = card.querySelector(`#chev-${cfg.id}`);
    head.addEventListener('click', e => {
      if (e.target.closest('.tog')) return;
      const open = body.classList.toggle('open');
      chev.style.transform = open ? 'rotate(180deg)' : '';
    });

    // Opacity slider
    const slider = card.querySelector(`#ops-${cfg.id}`);
    const valEl  = card.querySelector(`#opv-${cfg.id}`);
    slider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      slider.style.setProperty('--pct', `${v*100}%`);
      valEl.textContent = `${Math.round(v*100)}%`;
      setOpacity(cfg, v);
    });

    container.appendChild(card);
  });
}

function updateCount(id, n) {
  const el = $(`#cnt-${id}`);
  if (!el) return;
  const cfg = LAYERS.find(l=>l.id===id);
  el.innerHTML = `
    <span style="color:var(--tx-2);font-weight:700;">${n.toLocaleString('id-ID')}</span>
    <span style="color:var(--tx-3);"> fitur ${cfg?.icon||''}</span>
  `;
}

/* ════════════════════════════════════════════
   LEGEND
════════════════════════════════════════════ */
function buildLegend() {
  const el = $('#legend-items');
  if (!el) return;
  el.innerHTML = '';

  LAYERS.forEach(cfg => {
    const on = cfg.vis;
    const isHeat = cfg.type === 'heatmap';
    const isPoly = cfg.type === 'polygon';
    const item = document.createElement('div');
    item.className = `leg-item ${on ? '':'off'}`;
    item.id = `li-${cfg.id}`;

    const swatchClass = isPoly ? 'leg-swatch' : 'leg-swatch dot';
    item.innerHTML = `
      <div class="${swatchClass}" style="background:${cfg.color};box-shadow:${on?'0 0 6px '+cfg.color:'none'};"></div>
      <span class="leg-text">${cfg.icon} ${cfg.short}</span>
    `;
    el.appendChild(item);
  });
}

/* ════════════════════════════════════════════
   ANALYSIS PANEL
════════════════════════════════════════════ */
function buildAnalysis() {
  const counts = {};
  LAYERS.forEach(l => { counts[l.id] = S.layerData[l.id]?.count || 0; });

  const totalActivity = (counts['fasilitas'] || 0) + (counts['mall'] || 0) + (counts['pendidikan'] || 0);
  const ratio = counts['perumahan'] ? (totalActivity / counts['perumahan']).toFixed(1) : 0;

  // Stat cards
  const grid = $('#stat-cards');
  if (grid) {
    const items = [
      { val: (counts['hunian']||0).toLocaleString('id-ID'), label:'Titik Hunian', color:'var(--teal)' },
      { val: (counts['perumahan']||0).toLocaleString('id-ID'), label:'Perumahan', color:'var(--c-perumahan)' },
      { val: (counts['fasilitas']||0).toLocaleString('id-ID'), label:'Fasilitas', color:'var(--amber)' },
      { val: ((counts['mall']||0)+(counts['pendidikan']||0)).toLocaleString('id-ID'), label:'Mall & Edu', color:'var(--violet)' },
    ];
    grid.innerHTML = items.map(i=>`
      <div class="stat-card" style="border-left: 3px solid ${i.color}">
        <div class="sc-val" style="color:${i.color}">${i.val}</div>
        <div class="sc-label">${i.label}</div>
      </div>
    `).join('');
  }

  // Distribution chart
  const ctx = $('#dist-chart');
  if (ctx) {
    if (S.sparkChart) { S.sparkChart.destroy(); S.sparkChart = null; }
    const labels = ['Fasilitas', 'Mall', 'Pendidikan', 'Perumahan'];
    const data   = [counts['fasilitas']||0, counts['mall']||0, counts['pendidikan']||0, counts['perumahan']||0];
    const colors = ['rgba(251,191,36,.8)','rgba(236,72,153,.8)','rgba(96,165,250,.8)','rgba(74,222,128,.8)'];

    S.sparkChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets:[{
          data, 
          backgroundColor: colors, 
          borderColor: 'rgba(15,23,42,0.8)',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: true, position: 'right', labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.raw.toLocaleString('id-ID')} titik` }
          }
        }
      }
    });
  }

  // Insights
  const box = $('#insights-box');
  if (!box) return;

  let areaKm2 = 0;
  let density = 0;
  if (typeof turf !== 'undefined' && S.boundaryData) {
    try {
      const poly = S.boundaryData.features ? S.boundaryData.features[0] : S.boundaryData;
      areaKm2 = turf.area(poly) / 1000000;
      density = areaKm2 > 0 ? (totalActivity / areaKm2).toFixed(1) : 0;
    } catch (e) { console.warn(e); }
  }

  box.innerHTML = `
    <div class="insight-card">
      <div class="insight-title">📍 Analisis Spasial Real-time</div>
      <div class="insight-body">
        Luas area pemotongan (clipping) adalah <strong>${areaKm2 > 0 ? areaKm2.toFixed(2) : '?'} km²</strong>. 
        Terdapat <strong>${totalActivity.toLocaleString('id-ID')} titik</strong> aktivitas (fasilitas, mall, pendidikan) 
        dengan kepadatan mencapai <strong>${density} titik per km²</strong>. 
        Rasio perbandingan: <strong>${ratio}</strong> fasilitas per komplek perumahan.
      </div>
    </div>
    <div class="insight-card">
      <div class="insight-title">🏘️ Kepadatan Hunian</div>
      <div class="insight-body">
        Total <strong>${(counts['hunian']||0).toLocaleString('id-ID')}</strong> titik sampel hunian. 
        Berdasarkan perhitungan geometri nyata, pusat konsentrasi (center of mass) 
        aktivitas berada di dalam area analisis yang telah di-clip dengan korelasi tinggi terhadap jalan utama.
      </div>
    </div>
  `;
}

/* ════════════════════════════════════════════
   STATS BAR
════════════════════════════════════════════ */
function updateStats() {
  const total = LAYERS
    .filter(l => l.vis)
    .reduce((s,l) => s + (S.layerData[l.id]?.count || 0), 0);
  const active = LAYERS.filter(l=>l.vis).length;
  const zoom = S.map?.getZoom().toFixed(1) || '—';

  const el = id => $(`#stat-${id}`);
  if (el('feat'))   el('feat').textContent   = total.toLocaleString('id-ID');
  if (el('layers')) el('layers').textContent = active;
  if (el('zoom'))   el('zoom').textContent   = zoom;
}

function updateCoords() {
  const el = $('#stat-coord');
  if (el) el.textContent =
    `${S.coords.lat.toFixed(5)}°, ${S.coords.lng.toFixed(5)}°`;
}

/* ════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════ */
let searchTimer;
function handleSearch(q) {
  const map = S.map;
  const query = q.trim().toLowerCase();
  const clickableLayers = ['hunian-dot','fasilitas-circle','mall-circle','pendidikan-circle','perumahan-fill'];

  clickableLayers.forEach(lid => {
    try {
      if (!map.getLayer(lid)) return;
      if (!query) { map.setFilter(lid, null); return; }
      map.setFilter(lid, ['in', query, ['downcase',['coalesce',['get','name'],'']]] );
    } catch(_){}
  });
}

/* ════════════════════════════════════════════
   3D / PITCH TOGGLE
════════════════════════════════════════════ */
function toggle3D() {
  S.is3D = !S.is3D;
  const map = S.map;
  if (S.is3D) {
    map.easeTo({ pitch:52, bearing:-18, duration:800 });
    toast('Mode 3D aktif — Ctrl+drag untuk mengatur sudut pandang', 'inf', 4000);
  } else {
    map.easeTo({ pitch:0, bearing:0, duration:800 });
  }
  $('#btn-3d').classList.toggle('on', S.is3D);
}

/* ════════════════════════════════════════════
   ROAD FLOW ANIMATION
════════════════════════════════════════════ */
const DASH_SEQS = [
  [0,   4, 3],
  [0.5, 3.5, 3.5],
  [1,   3,   4],
  [1.5, 2.5, 4.5],
  [2,   2,   5],
  [2.5, 1.5, 5.5],
  [3,   1,   6],
  [3.5, 0.5, 6.5],
];
let _flowStep = 0, _flowPrev = 0;

function animateRoadFlow(ts) {
  if (!S.map?.getLayer('jalan-flow')) { requestAnimationFrame(animateRoadFlow); return; }
  if (ts - _flowPrev > 70) { // ~14fps — smooth without GPU overload
    try {
      S.map.setPaintProperty('jalan-flow', 'line-dasharray', DASH_SEQS[_flowStep]);
    } catch(_) {}
    _flowStep = (_flowStep + 1) % DASH_SEQS.length;
    _flowPrev = ts;
  }
  requestAnimationFrame(animateRoadFlow);
}


/* ════════════════════════════════════════════
   BUILDING 3D EXTRUSION
════════════════════════════════════════════ */
S.buildingsOn = false;

function addBuildingExtrusion() {
  const map = S.map;
  const src  = 'src-perumahan';
  if (!map.getSource(src)) return;

  const id = 'perumahan-extrusion';
  if (map.getLayer(id)) {
    // Toggle visibility
    const v = map.getLayoutProperty(id, 'visibility') === 'visible' ? 'none' : 'visible';
    map.setLayoutProperty(id, 'visibility', v);
    return;
  }

  // Animate height from 0 to full
  map.addLayer({
    id, type: 'fill-extrusion', source: src,
    minzoom: 11,
    layout: { visibility: 'visible' },
    paint: {
      'fill-extrusion-color': '#4ade80',
      'fill-extrusion-height': 0,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.72,
      'fill-extrusion-vertical-gradient': true,
    }
  }, 'perumahan-fill');

  // Animate the height up
  let h = 0;
  const target = 28;
  const anim = () => {
    h = Math.min(h + 1.2, target);
    map.setPaintProperty(id, 'fill-extrusion-height', h);
    if (h < target) requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);
  toast('Bangunan 3D aktif! Zoom in dan aktifkan perspektif 3D untuk tampilan terbaik', 'ok', 4000);
}

function toggleBuildings() {
  S.buildingsOn = !S.buildingsOn;
  $('#btn-building').classList.toggle('on', S.buildingsOn);
  addBuildingExtrusion();
  if (S.buildingsOn && !S.is3D) {
    S.map.easeTo({ pitch: 45, bearing: -15, duration: 900 });
    S.is3D = true;
    $('#btn-3d').classList.add('on');
  } else if (!S.buildingsOn && S.is3D) {
    S.map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    S.is3D = false;
    $('#btn-3d').classList.remove('on');
  }
}

/* ════════════════════════════════════════════
   AI CHATBOT — GEOBOT BANDUNG
════════════════════════════════════════════ */
const BOT = {
  isOpen: false,
  typing: false,

  // ── Knowledge Base ──────────────────────
  greet() {
    const counts = {};
    LAYERS.forEach(l => { counts[l.id] = S.layerData[l.id]?.count || 0; });
    return `Halo! Saya **GeoBot Bandung** 🤖, asisten virtual platform GIS Kepadatan Pusat Aktivitas Kota Bandung.\n\nSaya bisa membantu Anda memahami:\n• Data & statistik setiap layer\n• Cara menggunakan fitur peta\n• Analisis spasial & insight\n• Panduan visualisasi 3D\n\nApa yang ingin Anda ketahui?`;
  },

  respond(q) {
    const t = q.toLowerCase().trim();
    const counts = {};
    LAYERS.forEach(l => { counts[l.id] = S.layerData[l.id]?.count || 0; });
    const total = Object.values(counts).reduce((a,b)=>a+b,0);

    // Helper
    const r = (text, suggest=[]) => ({ text, suggest });

    // Greeting
    if (/^(halo|hai|hello|hi|hey|selamat|pagi|siang|sore|malam)/.test(t)) {
      return r(this.greet(), ['Berapa jumlah fasilitas?', 'Cara pakai 3D', 'Analisis Bandung']);
    }

    // Stats / jumlah
    if (/berapa|jumlah|total|banyak|data|angka/.test(t)) {
      if (/fasilitas|faskes|kesehatan|rumah sakit|klinik/.test(t)) {
        return r(`**Fasilitas Publik**\n\nTerdapat **${counts['fasilitas'].toLocaleString('id-ID')} titik** fasilitas publik di Bandung — rumah sakit, klinik, supermarket, dan fasilitas umum lainnya.`,
          ['Berapa jumlah pendidikan?', 'Berapa jumlah mall?', 'Analisis aksesibilitas']);
      }
      if (/mall|ritel|belanja|toko|retail/.test(t)) {
        return r(`**Mall & Ritel**\n\nTeridentifikasi **${counts['mall'].toLocaleString('id-ID')} titik** pusat perbelanjaan, mall, dan area ritel komersial di Kota Bandung.`,
          ['Berapa jumlah pendidikan?', 'Berapa jumlah fasilitas?', 'Cara klik pada peta?']);
      }
      if (/pendidikan|sekolah|kampus|universitas|sd|sma|smp/.test(t)) {
        return r(`**Institusi Pendidikan**\n\nTerdapat **${counts['pendidikan'].toLocaleString('id-ID')} titik** institusi pendidikan, dari SD hingga universitas dan politeknik.`,
          ['Berapa jumlah fasilitas?', 'Analisis aksesibilitas pendidikan', 'Cara pakai 3D']);
      }
      if (/perumahan|komplek|residensial|housing/.test(t)) {
        return r(`**Komplek Perumahan**\n\nTeridentifikasi **${counts['perumahan'].toLocaleString('id-ID')} komplek** perumahan residensial dalam batas studi Kota Bandung.`,
          ['Aktifkan bangunan 3D', 'Analisis hubungan hunian', 'Berapa jumlah fasilitas?']);
      }
      if (/hunian|poi|titik/.test(t)) {
        return r(`**Kepadatan Hunian & POI**\n\nDataset utama berisi **${counts['hunian'].toLocaleString('id-ID')} titik** hunian dan POI dari OpenStreetMap yang tersebar di seluruh Kota Bandung.`,
          ['Apa itu heatmap?', 'Analisis kepadatan', 'Cara klik pada peta?']);
      }
      if (/jalan|jalur|road/.test(t)) {
        return r(`**Jaringan Jalan Utama**\n\nDataset jalan berukuran **11MB** mencakup seluruh jaringan jalan utama Kota Bandung dengan visualisasi neon glow 3 lapis.`,
          ['Fitur 3D apa saja?', 'Cara pakai perspektif 3D', 'Analisis konektivitas']);
      }
      // Semua
      const totalAct = counts['fasilitas'] + counts['mall'] + counts['pendidikan'];
      return r(`**Ringkasan Semua Data**\n\nHunian & POI: **${counts['hunian'].toLocaleString('id-ID')}** titik\nKomplek Perumahan: **${counts['perumahan']}** area\nFasilitas Publik: **${counts['fasilitas']}** titik\nMall & Ritel: **${counts['mall']}** titik\nPendidikan: **${counts['pendidikan']}** titik\nJalan Utama: dataset 11MB\n\n**Total: ${total.toLocaleString('id-ID')} fitur**`,
        ['Analisis spasial Bandung', 'Cara pakai 3D', 'Apa itu heatmap?']);
    }

    // Heatmap
    if (/heatmap|panas|heat|kepadatan/.test(t) && !/jalan|jalur/.test(t)) {
      return r(`**Heatmap Kepadatan Hunian**\n\nHeatmap menampilkan distribusi konsentrasi hunian dan POI:\n\n• *Biru/Teal* = Kepadatan rendah\n• *Kuning* = Sedang\n• *Merah/Oranye* = Sangat padat\n\nPada **zoom rendah** (< 13): gradient heatmap\nPada **zoom tinggi** (> 13): titik individual yang bisa diklik\n\nKonsentrasi tertinggi di **pusat dan selatan Bandung**.`,
        ['Analisis kepadatan', 'Cara klik pada peta?', 'Berapa jumlah hunian?']);
    }

    // 3D features
    if (/3d|tiga dimensi|extrusion|perspektif|building|bangunan/.test(t)) {
      return r(`**Fitur 3D Platform**\n\n**Perspektif 3D** — Tombol ⬡ atau tekan [3]\n**Bangunan 3D** — Tombol 🏢 atau tekan [B]\n\nKomplek perumahan akan terangkat dengan animasi smooth ketika bangunan 3D diaktifkan.\n\n**Jalur Neon** — 3 lapis glow: wide glow → halo → core\n**Fly-to** — Klik titik manapun → kamera terbang 3D otomatis`,
        ['Cara pakai perspektif 3D', 'Aktifkan bangunan 3D sekarang?', 'Analisis jalur utama']);
    }

    // Aktifkan 3D dari chat
    if (/aktifkan|enable|nyalakan/.test(t) && /bangunan|3d|perspektif/.test(t)) {
      setTimeout(() => toggleBuildings(), 500);
      return r(`Baik! Mengaktifkan **bangunan 3D** untuk Anda... 🏢\n\nKomplek perumahan akan terangkat secara animasi. Zoom in ke area perumahan untuk tampilan terbaik!`,
        ['Cara reset tampilan?', 'Fitur 3D lainnya?', 'Analisis perumahan']);
    }

    // Cara pakai
    if (/cara|bagaimana|how|petunjuk|panduan|tutorial|pakai|gunakan/.test(t)) {
      return r(`**Cara Menggunakan Platform**\n\n**Navigasi Peta:**\n• Drag — gerakkan peta\n• Scroll — zoom in/out\n• Ctrl+Drag — rotasi & tilt\n\n**Keyboard:**\n• [3] Toggle 3D · [B] Bangunan · [R] Reset · [Esc] Tutup\n\n**Sidebar:**\n• Tab Layer — toggle & opacity\n• Tab Analisis — insight & grafik\n\n**Klik titik** → fly-to animasi + popup detail`,
        ['Fitur 3D apa saja?', 'Cara cari lokasi?', 'Apa itu heatmap?']);
    }

    // Layer info
    if (/layer|lapisan/.test(t) && !/3d|bangunan/.test(t)) {
      return r(`**Layer yang Tersedia (6 total)**\n\n— *Kepadatan Hunian* — heatmap POI\n— *Komplek Perumahan* — polygon + 3D\n— *Fasilitas Publik* — titik fasilitas\n— *Mall & Ritel* — komersial\n— *Pendidikan* — institusi pendidikan\n— *Jalur 3D* — neon road network\n\nToggle & opacity bisa diatur di sidebar Panel Layer.`,
        ['Berapa jumlah setiap layer?', 'Cara ubah gaya peta?', 'Analisis spasial']);
    }

    // Analisis
    if (/analisis|insight|temuan|korelasi|hubungan|relasi|spasial|aksesibilitas/.test(t)) {
      const totalAct = counts['fasilitas'] + counts['mall'] + counts['pendidikan'];
      const ratio = (totalAct / Math.max(1, counts['perumahan'])).toFixed(1);
      return r(`**Analisis Spasial Bandung**\n\n**Kepadatan Aktivitas:**\n${totalAct.toLocaleString('id-ID')} titik pusat aktivitas, rasio *${ratio}:1* per komplek perumahan → aksesibilitas *tinggi*\n\n**Distribusi Hunian:**\nKonsentrasi tertinggi di *pusat & selatan Bandung*, dekat koridor jalan utama\n\n**Konektivitas:**\nJl. Soekarno-Hatta & Dr. Djundjunan menghubungkan zona hunian ke pusat kegiatan\n\n**Pendidikan:**\n${counts['pendidikan']} institusi terdistribusi merata — korelasi *positif* dengan hunian`,
        ['Berapa jumlah fasilitas?', 'Buka tab Analisis', 'Aktivasi bangunan 3D']);
    }

    // Bandung info
    if (/bandung|kota|ibukota|jabar|jawa barat/.test(t)) {
      return r(`**Kota Bandung**\n\nIbu kota Provinsi Jawa Barat · luas ±167 km² · populasi ±2,5 juta jiwa.\n\n*Karakteristik Spasial:*\n• Kota padat beragam fungsi lahan\n• Pusat pendidikan tinggi (ITB, UNPAD)\n• Koridor wisata & komersial di pusat kota\n• Pertumbuhan perumahan di pinggiran\n\nData bersumber dari **OpenStreetMap**.`,
        ['Analisis spasial Bandung', 'Berapa data yang ada?', 'Cara pakai peta?']);
    }

    // Cara cari
    if (/cari|search|temukan|find/.test(t)) {
      return r(`**Fitur Pencarian**\n\nGunakan kotak pencarian di *top bar*:\n\n• Ketik nama lokasi atau fasilitas\n• Titik yang tidak cocok otomatis difilter\n• Tekan *Esc* untuk reset\n\nContoh: "rumah sakit", "ITB", "Trans Studio"`,
        ['Cara zoom ke Bandung?', 'Cara klik pada peta?', 'Cara ubah gaya peta?']);
    }

    // Gaya peta
    if (/gaya|style|basemap|tema|dark|light|atlas|gelap|terang/.test(t)) {
      return r(`**Gaya Basemap**\n\n• *Dark* — Tema gelap (default)\n• *Light* — Tema terang, detail lebih jelas\n• *Atlas* — Gaya Voyager, nama jalan tampak\n\nGunakan tab gaya di top bar untuk beralih.`,
        ['Cara pakai 3D?', 'Cara reset tampilan?', 'Fitur lainnya?']);
    }

    // Reset
    if (/reset|kembali|awal|default/.test(t)) {
      setTimeout(() => {
        S.map?.easeTo({center:CENTER,zoom:ZOOM,pitch:0,bearing:0,duration:800});
      }, 400);
      return r(`Mereset tampilan peta ke posisi semula... ✓\n\nZoom: ${ZOOM} · Pitch: 0° · Bandung tengah.`,
        ['Aktifkan mode 3D', 'Berapa data yang ada?', 'Analisis Bandung']);
    }

    // Terima kasih
    if (/terima kasih|makasih|thanks|thx|thank you/.test(t)) {
      return r(`Sama-sama! Senang bisa membantu. 😊\n\nAda pertanyaan lain tentang peta Bandung?`,
        ['Analisis spasial', 'Fitur 3D apa saja?', 'Berapa jumlah fasilitas?']);
    }

    // Default
    return r(`Belum mengerti pertanyaan itu. Coba tanyakan:\n• "Berapa jumlah fasilitas?"\n• "Cara pakai 3D"\n• "Analisis kepadatan Bandung"\n• "Apa itu heatmap?"`,
      ['Berapa jumlah fasilitas?', 'Cara pakai peta?', 'Analisis Bandung']);
  }
};

/* ── Chatbot DOM Functions ─────────────────── */

function chatAppendMsg(text, role='bot') {
  const wrap = $('#chat-messages');
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const av = document.createElement('div');
  av.className = `msg-avatar ${role}`;
  av.textContent = role === 'bot' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  // Parse simple markdown: **bold** and *em*
  bubble.innerHTML = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');

  msg.appendChild(av);
  msg.appendChild(bubble);
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}

function chatShowTyping() {
  const wrap = $('#chat-messages');
  const msg = document.createElement('div');
  msg.className = 'msg bot';
  msg.id = 'typing-indicator';
  msg.innerHTML = `
    <div class="msg-avatar bot">🤖</div>
    <div class="msg-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
}

function chatRemoveTyping() {
  $('#typing-indicator')?.remove();
}

function chatSend(q) {
  if (!q || !q.trim()) return;
  // Remove any existing suggestion row
  $('#chat-messages')?.querySelector('.chat-sugg-row')?.remove();

  chatAppendMsg(q, 'user');
  const ta = $('#chat-ta');
  if (ta) { ta.value = ''; ta.style.height = 'auto'; }

  chatShowTyping();
  const delay = 440 + Math.random() * 500;
  setTimeout(() => {
    chatRemoveTyping();
    const result = BOT.respond(q);
    const reply   = typeof result === 'string' ? result : result.text;
    const suggest = typeof result === 'object'  ? result.suggest : null;
    chatAppendMsg(reply, 'bot');
    if (suggest && suggest.length) chatShowSuggestions(suggest);
  }, delay);
}

function chatShowSuggestions(list) {
  const wrap = $('#chat-messages');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'chat-sugg-row';
  list.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'chat-sugg-chip';
    btn.textContent = s;
    btn.addEventListener('click', () => { row.remove(); chatSend(s); });
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

function toggleChat() {
  BOT.isOpen = !BOT.isOpen;
  const panel = $('#chat-panel');
  const btn   = $('#chat-btn');
  panel.classList.toggle('closed', !BOT.isOpen);
  btn.classList.toggle('open', BOT.isOpen);

  if (BOT.isOpen && $('#chat-messages').children.length === 0) {
    setTimeout(() => {
      chatAppendMsg(BOT.greet(), 'bot');
      setTimeout(() => chatShowSuggestions(['Berapa jumlah fasilitas?', 'Cara pakai 3D', 'Analisis Bandung']), 600);
    }, 250);
  }
  if (BOT.isOpen) setTimeout(() => $('#chat-ta')?.focus(), 320);
}

function initChatbot() {
  $('#chat-btn')?.addEventListener('click', toggleChat);
  $('#chat-close')?.addEventListener('click', toggleChat);

  // Clear chat
  $('#chat-clear')?.addEventListener('click', () => {
    const wrap = $('#chat-messages');
    if (wrap) {
      wrap.innerHTML = '';
      setTimeout(() => {
        chatAppendMsg(BOT.greet(), 'bot');
        setTimeout(() => chatShowSuggestions(['Berapa jumlah fasilitas?', 'Cara pakai 3D', 'Analisis Bandung']), 500);
      }, 150);
    }
  });

  // Send button
  $('#chat-send')?.addEventListener('click', () => {
    chatSend($('#chat-ta')?.value);
  });

  // Enter key (Shift+Enter for newline)
  $('#chat-ta')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSend(e.target.value);
    }
  });

  // Auto-resize textarea
  $('#chat-ta')?.addEventListener('input', e => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 64) + 'px';
  });

  // Quick chips
  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => chatSend(chip.dataset.q));
  });
}


/* ════════════════════════════════════════════
   SIDEBAR TAB SWITCHING
════════════════════════════════════════════ */
function switchTab(tab) {
  S.sidebarTab = tab;
  $$('.sb-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#layers-panel').classList.toggle('hidden', tab !== 'layers');
  $('#analysis-panel').classList.toggle('hidden', tab !== 'analysis');
}

/* ════════════════════════════════════════════
   EVENTS
════════════════════════════════════════════ */
function setupEvents() {
  // Close popup on empty map click
  S.map.on('click', e => {
    const clickable = LAYERS.flatMap(l => getSubLayers(l.id, l.type)).filter(lid => {
      try { return !!S.map.getLayer(lid); } catch(_){ return false; }
    });
    const hits = S.map.queryRenderedFeatures(e.point, { layers: clickable });
    if (!hits.length) {
      closePopup();
    }
  });
}

/* ════════════════════════════════════════════
   FPS COUNTER
════════════════════════════════════════════ */
function startFPS() {
  let last = performance.now(), frames = 0;
  const loop = now => {
    frames++;
    if (now - last >= 1000) {
      const fps = Math.round(frames * 1000 / (now - last));
      const el = $('#stat-fps');
      if (el) el.textContent = fps;
      last = now; frames = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ════════════════════════════════════════════
   LOADING
════════════════════════════════════════════ */
function hideLoading() {
  setTimeout(() => $('#loading')?.classList.add('done'), 700);
}

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  buildLayerCards();
  initMap();
  startFPS();

  /* Sidebar toggle */
  $('#btn-sidebar')?.addEventListener('click', () => {
    const sb = $('#sidebar');
    sb.classList.toggle('closed');
    $('#btn-sidebar').classList.toggle('on', !sb.classList.contains('closed'));
  });

  /* Sidebar tabs */
  $$('.sb-tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  /* Search */
  const si = $('#search-input');
  si?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => handleSearch(e.target.value), 380);
  });
  si?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value=''; handleSearch(''); }
  });

  /* Map style tabs */
  $$('.stab').forEach(b => {
    b.addEventListener('click', () => switchStyle(b.dataset.style));
  });

  /* Map controls */
  $('#btn-zoom-in')?.addEventListener('click',   () => S.map.zoomIn({duration:280}));
  $('#btn-zoom-out')?.addEventListener('click',  () => S.map.zoomOut({duration:280}));
  $('#btn-3d')?.addEventListener('click',        toggle3D);
  $('#btn-building')?.addEventListener('click',  toggleBuildings);
  $('#btn-reset')?.addEventListener('click',     () => {
    S.map.easeTo({center:CENTER,zoom:ZOOM,pitch:0,bearing:0,duration:800});
    S.is3D = false;
    S.buildingsOn = false;
    $('#btn-3d').classList.remove('on');
    $('#btn-building').classList.remove('on');
  });
  $('#btn-fit')?.addEventListener('click',       () =>
    S.map.fitBounds(BOUNDS,{padding:50,duration:800}));

  /* Popup close */
  $('#pop-close')?.addEventListener('click', closePopup);

  // Prevent clicks inside popup bubbling to the map
  $('#popup')?.addEventListener('click', e => e.stopPropagation());


  /* Keyboard */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePopup();
    }
    if (e.key === '3') toggle3D();
    if (e.key === 'b' || e.key === 'B') toggleBuildings();
    if (e.key === 'r' || e.key === 'R') {
      S.map.easeTo({center:CENTER,zoom:ZOOM,pitch:0,bearing:0,duration:800});
      S.is3D=false; S.buildingsOn=false;
      $('#btn-3d').classList.remove('on');
      $('#btn-building').classList.remove('on');
    }
  });

  /* Mobile sidebar overlay close */
  document.addEventListener('click', e => {
    const sb = $('#sidebar');
    const btn = $('#btn-sidebar');
    if (window.innerWidth <= 768 &&
        sb.classList.contains('mobile-open') &&
        !sb.contains(e.target) && !btn?.contains(e.target)) {
      sb.classList.remove('mobile-open');
    }
  });

  /* Init chatbot */
  initChatbot();
});
