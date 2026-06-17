// ============================================================
// Time Series Analyzer — Google Earth Engine App
// Desarrollado por Alberto Concejal / Geovisualization.net
// ============================================================

// ─── ESTILO CLARO ────────────────────────────────────────────
var STYLE = {
  bg:        '#f5f7fa',
  panel:     '#ffffff',
  accent:    '#1a73e8',
  highlight: '#d93025',
  text:      '#202124',
  subtext:   '#5f6368',
  border:    '#dadce0',
  success:   '#137333',
  warning:   '#e37400',
  chartLine: '#1a73e8',
  trendLine: '#d93025'
};

// ─── COLORED BUTTON HELPER ───────────────────────────────────
// GEE ui.Button ignores backgroundColor/color in style.
// We simulate colored buttons using a Panel + Label + onClick.
function makeButton(label, bgColor, textColor, onClick) {
  var btn = ui.Button({
    label: label,
    onClick: onClick,
    style: {
      width: '100%',
      margin: '4px 0',
      backgroundColor: bgColor,
      color: textColor,
      fontWeight: 'bold',
      fontSize: '12px'
    }
  });
  return btn;
}



// ─── AVAILABLE INDICES ──────────────────────────────────────────
var INDICES = {
  'NDVI': { desc: 'Normalized Difference Vegetation Index — (NIR-RED)/(NIR+RED)' },
  'EVI':  { desc: 'Enhanced Vegetation Index — enhances dense vegetation with less saturation' },
  'SAVI': { desc: 'Soil Adjusted Vegetation Index — corrects for bare soil effect' },
  'NDWI': { desc: 'Normalized Difference Water Index — detects moisture and surface water' },
  'NBR':  { desc: 'Normalized Burn Ratio — detects burned areas and fire severity' }
};

// ─── DETAILED ANALYSIS TEXTS ───────────────────────────────────
var ANALYSIS_HINTS = {
  'Autocorrelation (ACF)':
    'The ACF measures how similar the series is to a time-shifted version of itself. ' +
    'Each bar is a lag: lag 1 = correlation between observation i and the next; ' +
    'lag 2 = two steps back, etc. Dashed lines mark the 95% significance threshold (±1.96/√n). ' +
    'Bars exceeding that threshold indicate a real pattern, not noise.',
  'Linear Trend':
    'Fits a regression line over the full time series. The slope shows whether the index has ' +
    'systematically increased or decreased over the period. R² measures what proportion of total ' +
    'variability is explained by the trend: R²=1 is a perfect trend; R²≈0 means linear change ' +
    'does not capture the dynamics well.',
  'Value Distribution':
    'Histogram of index values within the selected geometry (temporal mean). ' +
    'Shows which range dominates and whether the distribution is unimodal (one cover type) ' +
    'or bimodal (mixed covers). Long tails toward low values indicate stress or bare soil.',
  'Smoothed Curve':
    'Applies cubic spline smoothing to the original series to remove image-to-image acquisition noise. ' +
    'Useful for visualizing the seasonal envelope and inter-annual changes without distraction ' +
    'from noisy points due to residual clouds or atmospheric conditions.'
};

var ANALYSIS_INTERP_GUIDE = {
  'Autocorrelation (ACF)':
    'Reading guide:\n' +
    '→ High lag 1 (>0.5): vegetation has strong "memory", changes slowly.\n' +
    '→ Peak at lag 6 or 12 (~16-day data): semi-annual or annual cycle — typical grassland seasonality.\n' +
    '→ ACF that decays slowly into a "tail": possible non-stationary trend in the series.\n' +
    '→ ACF oscillating between positive and negative: clear cyclic pattern, ideal for SARIMA modeling.\n' +
    '→ All bars within the lines: series with no temporal structure — possibly noise or heterogeneous geometry.',
  'Linear Trend':
    'Reading guide:\n' +
    '→ Positive slope + R²>0.3: significant vegetation recovery over the period.\n' +
    '→ Negative slope + R²>0.3: sustained degradation or land use change.\n' +
    '→ R²<0.1: linear trend does not capture the dynamics well — seasonality likely dominates.\n' +
    '→ Vertically scattered point cloud: high inter-annual variability, possible extreme events (droughts, fires).',
  'Value Distribution':
    'NDVI reference values:\n' +
    '→ 0.7–1.0: dense vegetation, closed forest.\n' +
    '→ 0.4–0.7: healthy grasslands, shrublands.\n' +
    '→ 0.2–0.4: sparse vegetation, dry or degraded grasslands.\n' +
    '→ 0.0–0.2: bare soil, urban areas, snow.\n' +
    '→ <0.0: surface water or unmasked clouds.\n' +
    'A very narrow distribution indicates homogeneous cover; a wide one indicates mixed land cover.',
  'Smoothed Curve':
    'Reading guide:\n' +
    '→ Recurring peaks at the same height each year: stable seasonality, resilient ecosystem.\n' +
    '→ Peaks declining year by year: possible progressive degradation.\n' +
    '→ Sharp drops followed by recovery: punctual events (drought, fire, intensive grazing).\n' +
    '→ Rising annual minima: improving baseline cover, possible revegetation.'
};

// ─── VARIABLES GLOBALES ──────────────────────────────────────
var drawnGeometry  = null;
var chartPanel     = null;
var statsLabel     = null;
var acfChartPanel  = null;
var interpretText  = null;
var currentResults = null;
var cachedValues   = null;

// ─── UI ROOT ─────────────────────────────────────────────────
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

// ============================================================
// HELPERS UI
// ============================================================
var sep = function() {
  return ui.Panel({style:{height:'1px', backgroundColor:STYLE.border, margin:'8px 0'}});
};

var sectionLabel = function(txt) {
  return ui.Label(txt, {
    fontSize:'10px', fontWeight:'bold', color:STYLE.subtext,
    margin:'10px 0 3px 0'
  });
};

// ============================================================
// PANEL IZQUIERDO — Controles
// ============================================================
var leftPanel = ui.Panel({
  style:{
    width:'220px', padding:'10px',
    backgroundColor:STYLE.panel,
    border:'1px solid ' + STYLE.border
  }
});

leftPanel.add(ui.Label('📈 Time Series Analyzer', {
  fontSize:'15px', fontWeight:'bold', color:STYLE.accent, margin:'0 0 2px 0'
}));
leftPanel.add(ui.Label('Geovisualization.net', {
  fontSize:'10px', color:STYLE.subtext, margin:'0 0 10px 0'
}));
leftPanel.add(sep());

// ── Index ──
leftPanel.add(sectionLabel('SPECTRAL INDEX'));
var indexSelect = ui.Select({
  items: Object.keys(INDICES),
  value: 'NDVI',
  placeholder: 'Select an index...',
  style:{color:STYLE.text}
});
leftPanel.add(indexSelect);
var indexDesc = ui.Label(INDICES['NDVI'].desc, {
  fontSize:'10px', color:STYLE.warning, margin:'3px 0 0 0'
});
leftPanel.add(indexDesc);
indexSelect.onChange(function(v){
  if (INDICES[v]) indexDesc.setValue(INDICES[v].desc);
});

leftPanel.add(sep());

// ── Platform ──
leftPanel.add(sectionLabel('SATELLITE PLATFORM'));
var platformSelect = ui.Select({
  items: ['Landsat (1984–2026)', 'Sentinel-2 (2017–2026)'],
  value: 'Landsat (1984–2026)',
  placeholder: 'Select platform...',
  style:{color:STYLE.text}
});
leftPanel.add(platformSelect);

leftPanel.add(sep());

// ── Dates ──
leftPanel.add(sectionLabel('START DATE'));
var dateStart = ui.Textbox({
  placeholder:'YYYY-MM-DD', value:'2000-01-01',
  style:{color:STYLE.text}
});
leftPanel.add(dateStart);

leftPanel.add(sectionLabel('END DATE'));
var dateEnd = ui.Textbox({
  placeholder:'YYYY-MM-DD', value:'2026-01-01',
  style:{color:STYLE.text}
});
leftPanel.add(dateEnd);

leftPanel.add(sep());

// ── Clouds ──
leftPanel.add(sectionLabel('MAX CLOUD COVER (%)'));
var cloudSlider = ui.Slider({min:0, max:50, value:10, step:5});
var cloudLabel  = ui.Label('10%', {fontSize:'11px', color:STYLE.warning});
cloudSlider.onChange(function(v){ cloudLabel.setValue(v + '%'); });
leftPanel.add(cloudSlider);
leftPanel.add(cloudLabel);

leftPanel.add(sep());

// ── Geometry status ──
var geoStatus = ui.Label('⬛ Draw a geometry on the map before RUN', {
  fontSize:'11px', color:STYLE.warning, margin:'4px 0'
});
leftPanel.add(geoStatus);

// ── RUN Button ──
var runButton = ui.Button({
  label: '▶  RUN ANALYSIS',
  style:{ fontWeight:'bold', fontSize:'12px', margin:'8px 0 4px 0' }
});
leftPanel.add(ui.Panel({style:{height:'4px', backgroundColor:'#1a73e8', margin:'8px 0 0 0'}}));
leftPanel.add(runButton);

statsLabel = ui.Label('', {fontSize:'11px', color:STYLE.success, margin:'2px 0'});
leftPanel.add(statsLabel);

leftPanel.add(sep());

// ── Export ──
var exportButton = ui.Button({
  label: '⬇  EXPORT CSV',
  style:{ fontSize:'12px', margin:'4px 0' }
});
leftPanel.add(ui.Panel({style:{height:'4px', backgroundColor:'#5f6368', margin:'4px 0 0 0'}}));
leftPanel.add(exportButton);

// CSV output panel — shown after export
var csvOutputPanel = ui.Panel({style:{shown:false, margin:'4px 0 0 0'}});
csvOutputPanel.add(ui.Label('📋 Select all rows below, copy and paste into Excel (A1):', {
  fontSize:'10px', fontWeight:'bold', color:STYLE.text, margin:'0 0 4px 0'
}));
var csvRowsPanel = ui.Panel({
  style:{
    backgroundColor:'#f5f5f5',
    border:'1px solid ' + STYLE.border,
    padding:'4px',
    margin:'0 0 4px 0'
  }
});
csvOutputPanel.add(csvRowsPanel);
csvOutputPanel.add(ui.Label('Each row = one image. Select from top to bottom, Ctrl+C, paste in Excel A1.', {
  fontSize:'9px', color:STYLE.subtext, margin:'2px 0 0 0'
}));
leftPanel.add(csvOutputPanel);

// ============================================================
// PANEL CENTRAL — Mapa + Serie temporal
// ============================================================
var mapPanel = ui.Map();
mapPanel.setOptions('SATELLITE');
mapPanel.style().set({cursor:'crosshair'});
mapPanel.setControlVisibility({layerList:true, zoomControl:true});
// Initial view: Iberian Peninsula
mapPanel.setCenter(-3.5, 40.4, 5);

var drawingTools = mapPanel.drawingTools();
drawingTools.setShown(true);
drawingTools.setDrawModes(['rectangle','polygon']);
drawingTools.onDraw(function(geom){
  drawnGeometry = geom;
  geoStatus.setValue('✅ Geometry ready. Press RUN.');
  geoStatus.style().set('color', STYLE.success);
  mapPanel.centerObject(geom, 10);
});
drawingTools.onEdit(function(geom){ drawnGeometry = geom; });

chartPanel = ui.Panel({
  style:{
    backgroundColor:STYLE.panel, padding:'8px', margin:'0',
    border:'1px solid ' + STYLE.border, minHeight:'220px'
  }
});
chartPanel.add(ui.Label('The time series will appear here after pressing RUN.', {
  fontSize:'12px', color:STYLE.subtext
}));

var centerPanel = ui.Panel({style:{backgroundColor:STYLE.bg}});
centerPanel.setLayout(ui.Panel.Layout.flow('vertical'));
centerPanel.add(mapPanel);
centerPanel.add(chartPanel);
centerPanel.style().set({stretch:'both'});
mapPanel.style().set({height:'60%', stretch:'horizontal'});
chartPanel.style().set({stretch:'both'});

// ============================================================
// PANEL DERECHO — Análisis + Interpretación extendida
// ============================================================
var rightPanel = ui.Panel({
  style:{
    width:'320px', padding:'10px',
    backgroundColor:STYLE.panel,
    border:'1px solid ' + STYLE.border
  }
});

rightPanel.add(ui.Label('📊 Pattern Analysis', {
  fontSize:'14px', fontWeight:'bold', color:STYLE.accent, margin:'0 0 4px 0'
}));

rightPanel.add(sectionLabel('ANALYSIS TYPE'));
var analysisSelect = ui.Select({
  items: Object.keys(ANALYSIS_HINTS),
  value: 'Autocorrelation (ACF)',
  placeholder: 'Select analysis...',
  style:{color:STYLE.text}
});
rightPanel.add(analysisSelect);

var analyzeButton = ui.Button({
  label: '🔍  ANALYZE PATTERNS',
  style:{ fontWeight:'bold', fontSize:'12px', margin:'4px 0 6px 0' }
});
rightPanel.add(ui.Panel({style:{height:'4px', backgroundColor:'#137333', margin:'4px 0 0 0'}}));
rightPanel.add(analyzeButton);
rightPanel.add(sep());

// ── Tab bar ──
var activeTab = 'chart'; // 'chart' | 'result' | 'guide'

var tabBar = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin:'0 0 6px 0'}
});

var tabChartBtn  = ui.Button({label:'📈 Chart',  style:{fontSize:'11px', fontWeight:'bold', margin:'0 2px 0 0'}});
var tabResultBtn = ui.Button({label:'💡 Result', style:{fontSize:'11px', margin:'0 2px 0 0'}});
var tabGuideBtn  = ui.Button({label:'📖 Guide',  style:{fontSize:'11px', margin:'0'}});

tabBar.add(tabChartBtn);
tabBar.add(tabResultBtn);
tabBar.add(tabGuideBtn);
rightPanel.add(tabBar);

// ── Tab content panels ──
// CHART tab
acfChartPanel = ui.Panel({
  style:{backgroundColor:STYLE.bg, padding:'4px',
    border:'1px solid ' + STYLE.border, shown:true}
});
acfChartPanel.add(ui.Label('The analysis chart will appear here.',
  {fontSize:'11px', color:STYLE.subtext}));
rightPanel.add(acfChartPanel);

// RESULT tab
var hintLabel = ui.Label(ANALYSIS_HINTS['Autocorrelation (ACF)'],
  {fontSize:'10px', color:'#1a237e'});
var interpretAutoBox = ui.Panel({
  style:{backgroundColor:'#fff8e1', padding:'8px',
    border:'1px solid #ffe082', shown:false}
});
interpretAutoBox.add(ui.Label('WHAT THIS ANALYSIS DOES',
  {fontSize:'10px', fontWeight:'bold', color:'#e65100', margin:'0 0 4px 0'}));
interpretAutoBox.add(hintLabel);
interpretAutoBox.add(ui.Panel({style:{height:'1px', backgroundColor:'#ffe082', margin:'6px 0'}}));
interpretAutoBox.add(ui.Label('AUTOMATIC RESULT',
  {fontSize:'10px', fontWeight:'bold', color:'#e65100', margin:'0 0 6px 0'}));
interpretText = ui.Label('Run RUN then ANALYZE to see results.',
  {fontSize:'10px', color:STYLE.subtext, fontStyle:'italic'});
interpretAutoBox.add(interpretText);
// Panel for structured multi-label interpretation
var interpretLinesPanel = ui.Panel({style:{margin:'0', shown:false}});
interpretAutoBox.add(interpretLinesPanel);
rightPanel.add(interpretAutoBox);

// GUIDE tab
var guideText = ui.Label(ANALYSIS_INTERP_GUIDE['Autocorrelation (ACF)'],
  {fontSize:'10px', color:STYLE.text});
var guideBox = ui.Panel({
  style:{backgroundColor:'#e8f5e9', padding:'8px',
    border:'1px solid #a5d6a7', shown:false}
});
guideBox.add(ui.Label('READING GUIDE',
  {fontSize:'10px', fontWeight:'bold', color:STYLE.success, margin:'0 0 4px 0'}));
guideBox.add(guideText);
rightPanel.add(guideBox);

// ── Tab switching logic ──
function switchTab(tab) {
  activeTab = tab;
  // Show/hide content panels
  acfChartPanel.style().set(  'shown', tab==='chart');
  interpretAutoBox.style().set('shown', tab==='result');
  guideBox.style().set(        'shown', tab==='guide');
  // Bold the active button label to signal selection
  tabChartBtn.setLabel( tab==='chart'  ? '▶ Chart'  : '📈 Chart');
  tabResultBtn.setLabel(tab==='result' ? '▶ Result' : '💡 Result');
  tabGuideBtn.setLabel( tab==='guide'  ? '▶ Guide'  : '📖 Guide');
}

tabChartBtn.onClick( function() { switchTab('chart');  });
tabResultBtn.onClick(function() { switchTab('result'); });
tabGuideBtn.onClick( function() { switchTab('guide');  });

// Update hints and guide when analysis type changes
analysisSelect.onChange(function(v){
  if (ANALYSIS_HINTS[v])         hintLabel.setValue(ANALYSIS_HINTS[v]);
  if (ANALYSIS_INTERP_GUIDE[v])  guideText.setValue(ANALYSIS_INTERP_GUIDE[v]);
});

// After ANALYZE runs, auto-switch to result tab
function switchToResult() { switchTab('result'); }

// ============================================================
// MONTAJE + PANEL RESIZE TOGGLES
// ============================================================
ui.root.add(leftPanel);
ui.root.add(centerPanel);
ui.root.add(rightPanel);



// ============================================================
// CLOUD MASKING FUNCTIONS
// ============================================================
function maskCloudsS2(img) {
  var qa = img.select('QA60');
  return img.updateMask(
    qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0))
  );
}

function maskCloudsL(img) {
  var qa = img.select('QA_PIXEL');
  return img.updateMask(
    qa.bitwiseAnd(1<<3).eq(0).and(qa.bitwiseAnd(1<<4).eq(0))
  );
}

// ============================================================
// INDEX CALCULATION FUNCTIONS
// ============================================================
function calcIndexS2(img, name) {
  var s = 0.0001;
  var r=img.select('B4').multiply(s), n=img.select('B8').multiply(s),
      g=img.select('B3').multiply(s), b=img.select('B2').multiply(s),
      s2=img.select('B12').multiply(s);
  if(name==='NDVI') return n.subtract(r).divide(n.add(r)).rename('index');
  if(name==='EVI')  return n.subtract(r).multiply(2.5)
    .divide(n.add(r.multiply(6)).subtract(b.multiply(7.5)).add(1)).rename('index');
  if(name==='SAVI') return n.subtract(r).multiply(1.5)
    .divide(n.add(r).add(0.5)).rename('index');
  if(name==='NDWI') return g.subtract(n).divide(g.add(n)).rename('index');
  if(name==='NBR')  return n.subtract(s2).divide(n.add(s2)).rename('index');
  return img.select(0).rename('index');
}

function calcIndexL(img, name) {
  var s=0.0000275, o=-0.2;
  var r=img.select('SR_B4').multiply(s).add(o),
      n=img.select('SR_B5').multiply(s).add(o),
      g=img.select('SR_B3').multiply(s).add(o),
      b=img.select('SR_B2').multiply(s).add(o),
      s2=img.select('SR_B7').multiply(s).add(o);
  if(name==='NDVI') return n.subtract(r).divide(n.add(r)).rename('index');
  if(name==='EVI')  return n.subtract(r).multiply(2.5)
    .divide(n.add(r.multiply(6)).subtract(b.multiply(7.5)).add(1)).rename('index');
  if(name==='SAVI') return n.subtract(r).multiply(1.5)
    .divide(n.add(r).add(0.5)).rename('index');
  if(name==='NDWI') return g.subtract(n).divide(g.add(n)).rename('index');
  if(name==='NBR')  return n.subtract(s2).divide(n.add(s2)).rename('index');
  return img.select(0).rename('index');
}

// ============================================================
// BUILD COLLECTION FUNCTION
// ============================================================
function getCollection(platform, start, end, geom, maxCloud) {
  var col, idxName = indexSelect.getValue();
  var bands = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7','QA_PIXEL'];

  if (platform === 'Sentinel-2 (2017–2026)') {
    col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(start, end).filterBounds(geom)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud))
      .map(maskCloudsS2);
    col = col.map(function(img){
      return calcIndexS2(img, idxName)
             .set('system:time_start', img.get('system:time_start'));
    });
  } else {
    var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
      .filterDate(start,end).filterBounds(geom)
      .filter(ee.Filter.lt('CLOUD_COVER',maxCloud)).select(bands);
    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(start,end).filterBounds(geom)
      .filter(ee.Filter.lt('CLOUD_COVER',maxCloud)).select(bands);
    var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(start,end).filterBounds(geom)
      .filter(ee.Filter.lt('CLOUD_COVER',maxCloud))
      .select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7','QA_PIXEL'], bands);
    var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(start,end).filterBounds(geom)
      .filter(ee.Filter.lt('CLOUD_COVER',maxCloud))
      .select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7','QA_PIXEL'], bands);

    col = l5.merge(l7).merge(l8).merge(l9).map(maskCloudsL);
    col = col.map(function(img){
      return calcIndexL(img, idxName)
             .set('system:time_start', img.get('system:time_start'));
    });
  }
  return col;
}

// ============================================================
// RUN
// ============================================================
runButton.onClick(function(){
  if (!drawnGeometry) {
    statsLabel.setValue('⚠ Draw a geometry on the map first.');
    return;
  }
  cachedValues = null;
  statsLabel.setValue('⏳ Processing...');
  chartPanel.clear();
  chartPanel.add(ui.Label('Loading time series...', {fontSize:'11px', color:STYLE.subtext}));
  acfChartPanel.clear();
  interpretText.setValue('Ejecuta ANALIZAR para ver resultados.');

  var platform  = platformSelect.getValue();
  var start     = dateStart.getValue();
  var end       = dateEnd.getValue();
  var maxCloud  = cloudSlider.getValue();
  var geom      = drawnGeometry;
  var scale     = (platform === 'Sentinel-2 (2017–2026)') ? 10 : 30;
  var idxName   = indexSelect.getValue();

  var col = getCollection(platform, start, end, geom, maxCloud);

  // Mosaic on map
  var mosaicImg = col.mean().clip(geom);
  var palette = ['#d73027','#fc8d59','#fee08b','#91cf60','#1a9641'];
  mapPanel.layers().reset();
  mapPanel.addLayer(mosaicImg, {min:-0.1, max:0.8, palette: palette}, idxName + ' (mean)');
  // Center on geometry then zoom out 2 levels
  mapPanel.centerObject(geom);
  var zoom = mapPanel.getZoom();
  mapPanel.setZoom(Math.max(1, zoom - 2));

  // ── Build/refresh map legend ──
  mapPanel.widgets().forEach(function(w) {
    // Remove previous legend if any
    try { if (w.style().get('position') === 'bottom-right') mapPanel.remove(w); } catch(e) {}
  });

  var legendPanel = ui.Panel({
    style: {
      position: 'bottom-right',
      padding: '8px',
      backgroundColor: 'rgba(255,255,255,0.9)'
    }
  });

  legendPanel.add(ui.Label(idxName + ' (mean)', {
    fontWeight: 'bold', fontSize: '12px', color: '#202124', margin: '0 0 5px 0'
  }));

  // Continuous gradient bar — 60 x 1px slices interpolating red→yellow→green
  // Control points: [r,g,b] at positions 0.0, 0.33, 0.66, 1.0
  var cp = [
    {p:0.00, r:215, g:48,  b:39},   // #d73027 deep red
    {p:0.25, r:253, g:174, b:97},   // #fdae61 orange
    {p:0.55, r:254, g:224, b:139},  // #fee08b yellow
    {p:0.78, r:145, g:207, b:96},   // #91cf60 light green
    {p:1.00, r:26,  g:150, b:65}    // #1a9641 dark green
  ];

  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  function toHex(r,g,b) {
    return '#' + ('0'+r.toString(16)).slice(-2) +
                 ('0'+g.toString(16)).slice(-2) +
                 ('0'+b.toString(16)).slice(-2);
  }
  function interpolateColor(t) {
    // find segment
    for (var i = 0; i < cp.length - 1; i++) {
      if (t >= cp[i].p && t <= cp[i+1].p) {
        var seg = (t - cp[i].p) / (cp[i+1].p - cp[i].p);
        return toHex(
          lerp(cp[i].r, cp[i+1].r, seg),
          lerp(cp[i].g, cp[i+1].g, seg),
          lerp(cp[i].b, cp[i+1].b, seg)
        );
      }
    }
    return toHex(cp[cp.length-1].r, cp[cp.length-1].g, cp[cp.length-1].b);
  }

  var N_SLICES = 80;
  var colorBarRow = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin:'0 0 2px 0', padding:'0'}
  });
  for (var si = 0; si < N_SLICES; si++) {
    var t = si / (N_SLICES - 1);
    colorBarRow.add(ui.Panel({
      style: {
        backgroundColor: interpolateColor(t),
        width: '2px', height: '16px',
        margin: '0', padding: '0'
      }
    }));
  }
  legendPanel.add(colorBarRow);

  // Tick labels below gradient
  var ticksRow = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin:'2px 0 0 0', width:'162px'}
  });
  var ticks = [{label:'-0.1', pct:'0%'}, {label:'0.2', pct:'36%'},
               {label:'0.5', pct:'67%'}, {label:'0.8', pct:'100%'}];
  // Space them with flexible panels between
  ticksRow.add(ui.Label('-0.1', {fontSize:'9px', color:STYLE.subtext, margin:'0 0 0 0'}));
  ticksRow.add(ui.Panel({style:{stretch:'horizontal'}}));
  ticksRow.add(ui.Label('0.2',  {fontSize:'9px', color:STYLE.subtext, margin:'0'}));
  ticksRow.add(ui.Panel({style:{stretch:'horizontal'}}));
  ticksRow.add(ui.Label('0.5',  {fontSize:'9px', color:STYLE.subtext, margin:'0'}));
  ticksRow.add(ui.Panel({style:{stretch:'horizontal'}}));
  ticksRow.add(ui.Label('0.8',  {fontSize:'9px', color:STYLE.subtext, margin:'0'}));
  legendPanel.add(ticksRow);

  mapPanel.add(legendPanel);

  // Number of images
  col.size().evaluate(function(n){
    statsLabel.setValue('✅ ' + n + ' images used');
  });

  // ── Time series with annual bands ──
  var fcSeries = col.map(function(img){
    var mean = img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom, scale: scale, maxPixels: 1e9
    });
    return ee.Feature(null, { t: img.get('system:time_start'), v: mean.get('index') });
  });

  fcSeries.evaluate(function(result){
    if (!result || !result.features || result.features.length === 0) {
      chartPanel.clear();
      chartPanel.add(ui.Label('No data. Check dates, geometry or cloud filter.',
        {fontSize:'11px', color:STYLE.warning}));
      return;
    }
    var feats = result.features;
    feats.sort(function(a,b){ return a.properties.t - b.properties.t; });

    var valsOnly = [], rows = [];
    feats.forEach(function(f){
      var v = f.properties.v;
      if (v !== null && v !== undefined && !isNaN(v)) {
        valsOnly.push(v);
        rows.push({t: f.properties.t, v: v});
      }
    });
    cachedValues = valsOnly;

    if (rows.length === 0) {
      chartPanel.clear();
      chartPanel.add(ui.Label('No valid values found.', {fontSize:'11px', color:STYLE.warning}));
      return;
    }

    var vMax = -9999, vMin = 9999;
    rows.forEach(function(r){ if(r.v>vMax) vMax=r.v; if(r.v<vMin) vMin=r.v; });
    var bandTop = vMax + 0.08;

    var cols = [
      {id:'fecha',   label:'Date',    type:'datetime'},
      {id:'bandPar', label:'Even year',  type:'number'},
      {id:'bandImp', label:'Odd year',type:'number'},
      {id:'ndvi',    label: idxName,   type:'number'}
    ];

    var dataRows = rows.map(function(r){
      var yr = new Date(r.t).getFullYear();
      return {c:[
        {v: new Date(r.t)},
        {v: (yr % 2 === 0) ? bandTop : null},
        {v: (yr % 2 !== 0) ? bandTop : null},
        {v: r.v}
      ]};
    });

    var seriesChart = ui.Chart({cols:cols, rows:dataRows})
      .setChartType('ComboChart')
      .setOptions({
        title: idxName + ' · Time Series · ' + start + ' → ' + end,
        titleTextStyle:{color:STYLE.text, fontSize:13, bold:true},
        seriesType:'area',
        series:{
          0:{type:'area', color:'#e0e0e0', lineWidth:0, areaOpacity:0.55,
             visibleInLegend:false, enableInteractivity:false},
          1:{type:'area', color:'#ffffff', lineWidth:0, areaOpacity:0.0,
             visibleInLegend:false, enableInteractivity:false},
          2:{type:'line', color:STYLE.chartLine, lineWidth:2, pointSize:3,
             visibleInLegend:false}
        },
        vAxis:{
          title:idxName, titleTextStyle:{color:STYLE.subtext},
          textStyle:{color:STYLE.text}, gridlines:{color:STYLE.border},
          viewWindow:{min:vMin-0.05, max:bandTop+0.02}
        },
        hAxis:{
          title:'Date', titleTextStyle:{color:STYLE.subtext},
          textStyle:{color:STYLE.text}, format:'yyyy'
        },
        backgroundColor:'#ffffff', chartArea:{backgroundColor:'#ffffff'},
        legend:{position:'none'}, interpolateNulls:false
      });

    chartPanel.clear();
    chartPanel.add(seriesChart);
  });

  // Save reference for analysis
  currentResults = { col:col, geom:geom, scale:scale, indexName:idxName };
});

// ============================================================
// EXPORTAR CSV
// ============================================================
exportButton.onClick(function(){
  if (!currentResults) {
    statsLabel.setValue('⚠ Run RUN first.');
    return;
  }

  // Build CSV client-side from the FeatureCollection — no GEE Tasks needed
  statsLabel.setValue('⏳ Building CSV...');

  var fc = currentResults.col.map(function(img){
    var mean = img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: currentResults.geom,
      scale: currentResults.scale,
      maxPixels: 1e9
    });
    return ee.Feature(null, {
      date:  ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
      value: mean.get('index')
    });
  });

  fc.evaluate(function(result) {
    if (!result || !result.features || result.features.length === 0) {
      statsLabel.setValue('⚠ No data to export. Run RUN first.');
      return;
    }

    // Sort by date
    var feats = result.features;
    feats.sort(function(a, b) {
      return a.properties.date < b.properties.date ? -1 : 1;
    });

    // Build CSV string
    var lines = ['date\t' + currentResults.indexName];
    feats.forEach(function(f) {
      var d = f.properties.date;
      var v = f.properties.value;
      if (d && v !== null && v !== undefined) {
        lines.push(d + '\t' + v.toFixed(6).replace('.', ','));
      }
    });
    // lines array used directly as individual labels

    // Open as data URI — browser will prompt save or open as text
    var filename = 'serie_' + currentResults.indexName + '_' +
                   dateStart.getValue() + '_' + dateEnd.getValue() + '.csv';
    // Build one Label per row so copy-paste preserves line breaks in Excel
    csvRowsPanel.clear();
    lines.forEach(function(line) {
      csvRowsPanel.add(ui.Label(line, {
        fontSize:'9px',
        fontFamily:'monospace',
        color: STYLE.text,
        margin:'0',
        padding:'0'
      }));
    });
    csvOutputPanel.style().set('shown', true);
    statsLabel.setValue('✅ ' + (lines.length - 1) + ' rows ready — select all and paste into Excel A1.');
  });
});

// ============================================================
// ANALIZAR PATRONES
// ============================================================
analyzeButton.onClick(function(){
  if (!currentResults) {
    interpretLinesPanel.style().set('shown', false);
    interpretText.style().set('shown', true);
    interpretText.setValue('⚠ Run RUN first to load data.');
    return;
  }
  acfChartPanel.clear();
  acfChartPanel.add(ui.Label('Calculating...', {fontSize:'11px', color:STYLE.subtext}));
  interpretLinesPanel.style().set('shown', false);
  interpretText.style().set('shown', true);
  interpretText.setValue('Calculating...');

  var analysisType = analysisSelect.getValue();
  var col   = currentResults.col;
  var geom  = currentResults.geom;
  var scale = currentResults.scale;
  var name  = currentResults.indexName;

  // ── Tendencia lineal ──
  if (analysisType === 'Linear Trend') {
    var tChart = ui.Chart.image.series({
      imageCollection: col, region:geom, reducer:ee.Reducer.mean(),
      scale:scale, xProperty:'system:time_start'
    }).setChartType('ScatterChart')
      .setOptions({
        title:'Linear Trend — ' + name,
        titleTextStyle:{color:STYLE.text, bold:true},
        trendlines:{0:{type:'linear', color:STYLE.trendLine, lineWidth:2,
          showR2:true, visibleInLegend:true}},
        pointSize:3, colors:[STYLE.chartLine],
        vAxis:{title:name, textStyle:{color:STYLE.text}, gridlines:{color:STYLE.border}},
        hAxis:{title:'Date', textStyle:{color:STYLE.text}},
        backgroundColor:'#ffffff', chartArea:{backgroundColor:'#ffffff'},
        legend:{textStyle:{color:STYLE.text}}
      });
    acfChartPanel.clear(); acfChartPanel.add(tChart);
    switchTab('chart');
    interpretLinesPanel.clear(); interpretLinesPanel.style().set('shown', true);
    interpretText.style().set('shown', false);
    [
      {t:'Linear Trend interpretation', h:true},
      {t:'► Positive slope → vegetation recovery over time.'},
      {t:'► Negative slope → sustained degradation or land use change.'},
      {t:'► R² close to 1 → linear trend explains most variability.'},
      {t:'► R² close to 0 → seasonal variability dominates over trend.'}
    ].forEach(function(l) {
      interpretLinesPanel.add(ui.Label(l.t, {
        fontSize:'10px', fontWeight: l.h ? 'bold' : 'normal',
        color: l.h ? '#1a4a6b' : '#333', margin: l.h ? '0 0 4px 0' : '2px 0 2px 8px'
      }));
    });
    return;
  }

  // ── Distribución ──
  if (analysisType === 'Value Distribution') {
    var hChart = ui.Chart.image.histogram({
      image:col.mean().clip(geom), region:geom, scale:scale, maxBuckets:30
    }).setOptions({
      title:'Value Distribution — ' + name,
      titleTextStyle:{color:STYLE.text, bold:true},
      colors:[STYLE.chartLine],
      vAxis:{title:'Frequency', textStyle:{color:STYLE.text}, gridlines:{color:STYLE.border}},
      hAxis:{title:name, textStyle:{color:STYLE.text}},
      backgroundColor:'#ffffff', chartArea:{backgroundColor:'#ffffff'},
      legend:{position:'none'}
    });
    acfChartPanel.clear(); acfChartPanel.add(hChart);
    switchTab('chart');
    interpretLinesPanel.clear(); interpretLinesPanel.style().set('shown', true);
    interpretText.style().set('shown', false);
    [
      {t:'Value Distribution interpretation', h:true},
      {t:'► Narrow high peak → homogeneous land cover.'},
      {t:'► Wide distribution → mixed land cover within the geometry.'},
      {t:'NDVI reference:', h2:true},
      {t:'· > 0.6 → dense forest'},
      {t:'· 0.3–0.6 → grassland / shrubland'},
      {t:'· < 0.2 → bare soil or vegetation stress'}
    ].forEach(function(l) {
      interpretLinesPanel.add(ui.Label(l.t, {
        fontSize:'10px',
        fontWeight: (l.h || l.h2) ? 'bold' : 'normal',
        color: l.h ? '#1a4a6b' : l.h2 ? '#137333' : '#333',
        margin: (l.h||l.h2) ? '4px 0 2px 0' : '1px 0 1px 8px'
      }));
    });
    return;
  }

  // ── Curva suavizada ──
  if (analysisType === 'Smoothed Curve') {
    var sChart = ui.Chart.image.series({
      imageCollection:col, region:geom, reducer:ee.Reducer.mean(),
      scale:scale, xProperty:'system:time_start'
    }).setChartType('LineChart')
      .setOptions({
        title:'Smoothed Curve — ' + name,
        titleTextStyle:{color:STYLE.text, bold:true},
        lineWidth:2, pointSize:2, curveType:'function',
        colors:[STYLE.chartLine],
        vAxis:{title:name, textStyle:{color:STYLE.text}, gridlines:{color:STYLE.border}},
        hAxis:{title:'Date', textStyle:{color:STYLE.text}},
        backgroundColor:'#ffffff', chartArea:{backgroundColor:'#ffffff'},
        legend:{position:'none'}
      });
    acfChartPanel.clear(); acfChartPanel.add(sChart);
    switchTab('chart');
    interpretLinesPanel.clear(); interpretLinesPanel.style().set('shown', true);
    interpretText.style().set('shown', false);
    [
      {t:'Smoothed Curve interpretation', h:true},
      {t:'Cubic spline removes image-to-image noise. Compare seasonal amplitude across years:'},
      {t:'► Declining annual peaks → possible progressive degradation.'},
      {t:'► Rising annual troughs → improving baseline cover.'},
      {t:'► Sharp drop + recovery → punctual event (drought, fire, grazing).'},
      {t:'► Stable peaks every year → resilient, seasonally consistent ecosystem.'}
    ].forEach(function(l) {
      interpretLinesPanel.add(ui.Label(l.t, {
        fontSize:'10px', fontWeight: l.h ? 'bold' : 'normal',
        color: l.h ? '#1a4a6b' : '#333', margin: l.h ? '0 0 4px 0' : '2px 0 2px 8px'
      }));
    });
    return;
  }

  // ── ACF ──
  if (analysisType === 'Autocorrelation (ACF)') {
    if (cachedValues && cachedValues.length > 3) {
      computeAndShowACF(cachedValues, name);
      return;
    }
    var fc = col.map(function(img){
      var mean = img.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom, scale: scale, maxPixels: 1e9
      });
      return ee.Feature(null, {
        t: img.get('system:time_start'),
        v: mean.get('index')
      });
    });
    fc.evaluate(function(result){
      if (!result || !result.features || result.features.length === 0) {
        acfChartPanel.clear();
        acfChartPanel.add(ui.Label('No data returned.', {fontSize:'11px', color:STYLE.warning}));
        return;
      }
      var feats = result.features;
      feats.sort(function(a,b){ return a.properties.t - b.properties.t; });
      var vals = [];
      feats.forEach(function(f){
        var v = f.properties.v;
        if (v !== null && v !== undefined && !isNaN(v)) vals.push(v);
      });
      cachedValues = vals;
      computeAndShowACF(vals, name);
    });
  }
});

// ============================================================
// CALCULA Y MUESTRA LA ACF
// ============================================================
function computeAndShowACF(vals, name) {
  if (vals.length < 5) {
    acfChartPanel.clear();
    acfChartPanel.add(ui.Label(
      'Insufficient data for ACF (minimum 5 observations).',
      {fontSize:'11px', color:STYLE.warning}
    ));
    interpretLinesPanel.style().set('shown', false);
    interpretText.style().set('shown', true);
    interpretText.setValue('Expand the date range or reduce the cloud filter.');
    return;
  }

  var n      = vals.length;
  var maxLag = Math.min(24, Math.floor(n / 2));

  var mean = 0;
  for (var i = 0; i < n; i++) mean += vals[i];
  mean /= n;

  var varTot = 0;
  for (var i = 0; i < n; i++) varTot += Math.pow(vals[i] - mean, 2);

  var acf = [];
  for (var lag = 0; lag <= maxLag; lag++) {
    var cov = 0;
    for (var j = 0; j < n - lag; j++) {
      cov += (vals[j] - mean) * (vals[j + lag] - mean);
    }
    acf.push(cov / varTot);
  }

  var sig = 1.96 / Math.sqrt(n);

  var dataTable = {
    cols:[
      {id:'lag',  label:'Lag', type:'number'},
      {id:'acf',  label:'ACF',     type:'number'},
      {id:'sigP', label:'+95% CI', type:'number'},
      {id:'sigN', label:'−95% CI', type:'number'}
    ],
    rows: acf.map(function(v, idx){
      return {c:[{v:idx},{v:v},{v:sig},{v:-sig}]};
    })
  };

  var acfChart = ui.Chart(dataTable)
    .setChartType('ComboChart')
    .setOptions({
      title: 'ACF — ' + name + '  (n=' + n + ', 95%CI=±' + sig.toFixed(2) + ')',
      titleTextStyle:{color:STYLE.text, bold:true, fontSize:11},
      seriesType:'bars',
      series:{
        0:{type:'bars',  color:STYLE.chartLine, visibleInLegend:false},
        1:{type:'line',  color:STYLE.warning, lineWidth:1, lineDashStyle:[4,4],
           pointSize:0, visibleInLegend:true},
        2:{type:'line',  color:STYLE.warning, lineWidth:1, lineDashStyle:[4,4],
           pointSize:0, visibleInLegend:false}
      },
      vAxis:{
        title:'Correlation', viewWindow:{min:-1.1, max:1.1},
        textStyle:{color:STYLE.text}, gridlines:{color:STYLE.border},
        baselineColor:'#555555'
      },
      hAxis:{
        title:'Lag (periods)',
        textStyle:{color:STYLE.text}
      },
      backgroundColor:'#ffffff',
      chartArea:{backgroundColor:'#ffffff'},
      legend:{position:'top', textStyle:{color:STYLE.subtext}},
      height:220
    });

  acfChartPanel.clear();
  acfChartPanel.add(acfChart);
  switchTab('chart');

  // ── Point-by-point interpretation ──
  var lines = [];

  // 1. Short-term memory (lag 1)
  var lag1 = acf[1] || 0;
  lines.push('1.  SHORT-TERM MEMORY  (lag 1 = ' + lag1.toFixed(2) + ')');
  if (Math.abs(lag1) > sig) {
    var mem = lag1 > 0.7 ? 'very strong' : lag1 > 0.4 ? 'moderate' : 'weak';
    lines.push('    ► Significant (' + mem + '). Consecutive values are correlated.');
    lines.push('    ' + (lag1 > 0
      ? 'A high index today predicts a high index in the next image.'
      : 'Values oscillate rapidly — possible noise or fast land-cover change.'));
  } else {
    lines.push('    ► Not significant. No short-term predictability.');
    lines.push('    The series behaves close to random noise at this timescale.');
  }

  // 2. Seasonal cycle
  var peakVal = 0, peakLag = 0;
  for (var m = 2; m <= maxLag; m++) {
    if (acf[m] !== undefined && Math.abs(acf[m]) > Math.abs(peakVal)) {
      peakVal = acf[m]; peakLag = m;
    }
  }
  lines.push('');
  lines.push('2.  SEASONAL CYCLE  (strongest lag = ' + peakLag + ', r = ' + peakVal.toFixed(2) + ')');
  if (Math.abs(peakVal) > sig) {
    var mthL = Math.round(peakLag * 16 / 30);
    var mthS = Math.round(peakLag * 5  / 30);
    lines.push('    ► Significant peak → clear periodicity detected.');
    var daysL = peakLag * 8;
    var daysS = Math.round(peakLag * 4);
    lines.push('    Landsat (L8+L9, ~8 days): cycle ≈ ' + daysL + ' days (' + Math.round(daysL/30.5) + ' months).');
    lines.push('    Sentinel-2 (~4 days avg): cycle ≈ ' + daysS + ' days (' + Math.round(daysS/30.5) + ' months).');
    lines.push('    This is consistent with ' +
      (mthL >= 10 ? 'an annual phenological cycle.' :
       mthL >= 5  ? 'a semi-annual seasonal pattern.' :
                    'a short intra-seasonal fluctuation.'));
  } else {
    lines.push('    ► No significant seasonal peak found in the ACF.');
    lines.push('    Possible causes: series too short, very homogeneous cover,');
    lines.push('    or strong trend masking the cycle.');
  }

  // 3. Memory length
  var lastSig = 0;
  for (var k = 1; k <= maxLag; k++) {
    if (acf[k] && Math.abs(acf[k]) > sig) lastSig = k;
  }
  lines.push('');
  lines.push('3.  MEMORY LENGTH  (last significant lag = ' + lastSig + ')');
  if (lastSig === 0) {
    lines.push('    ► No significant autocorrelation at any lag.');
    lines.push('    The series has no detectable temporal structure.');
  } else if (lastSig > maxLag * 0.6) {
    lines.push('    ► Long memory — ACF remains significant up to lag ' + lastSig + '.');
    lines.push('    This suggests a non-stationary trend in the data.');
    lines.push('    Recommendation: apply first-order differencing before fitting ARIMA/SARIMA.');
  } else if (acf.length > 4 && Math.abs(acf[3]) < sig) {
    lines.push('    ► Short memory — significant only at lags 1–2.');
    lines.push('    The series "forgets" its past quickly. Year-to-year variability is high.');
  } else {
    lines.push('    ► Medium memory up to lag ' + lastSig + '.');
    lines.push('    Structure is present but does not persist across the full series.');
  }

  // 4. Model suggestion
  lines.push('');
  lines.push('4.  MODEL SUGGESTION');
  if (lastSig > maxLag * 0.6) {
    lines.push('    ► Non-stationary series. Difference first, then fit ARIMA(p,1,q).');
  } else if (Math.abs(peakVal) > sig) {
    lines.push('    ► Seasonal structure detected. SARIMA(p,d,q)(P,D,Q)[s] recommended.');
    lines.push('    where s = ' + peakLag + ' (seasonal period in acquisitions).');
  } else if (Math.abs(lag1) > sig) {
    lines.push('    ► Short-term dependence only. Simple AR(1) or ARIMA(1,0,0) may suffice.');
  } else {
    lines.push('    ► No clear structure. Consider increasing the time range or reducing cloud filter.');
  }

  // Build one Label per line for readable formatting
  interpretText.style().set('shown', false);
  interpretLinesPanel.clear();
  interpretLinesPanel.style().set('shown', true);

  lines.forEach(function(line) {
    if (line === '') {
      // Empty line = spacer between sections
      interpretLinesPanel.add(ui.Panel({style:{height:'8px'}}));
    } else if (line.match(/^\d+\./)) {
      // Section header (e.g. "1.  SHORT-TERM MEMORY...")
      interpretLinesPanel.add(ui.Label(line.trim(), {
        fontSize:'10px', fontWeight:'bold', color:'#1a4a6b',
        margin:'0 0 2px 0'
      }));
    } else if (line.match(/^\s+►/)) {
      // Main finding line
      interpretLinesPanel.add(ui.Label(line.trim(), {
        fontSize:'10px', fontWeight:'bold', color:'#137333',
        margin:'2px 0 2px 8px'
      }));
    } else {
      // Detail line
      interpretLinesPanel.add(ui.Label(line.trim(), {
        fontSize:'10px', color:'#333333',
        margin:'1px 0 1px 8px'
      }));
    }
  });

  // Auto-show result tab after ACF
  switchToResult();
}
