# Time Series Analyzer — Análisis multitemporal de índices espectrales en Google Earth Engine

He desarrollado una aplicación interactiva en Google Earth Engine para la extracción y análisis estadístico de series temporales de índices espectrales sobre cualquier geometría definida por el usuario. El objetivo es pasar de una imagen satélite puntual a una comprensión temporal del territorio: qué ha pasado, qué patrón subyace, y qué cabe esperar.

---

**Stack**

La app está escrita íntegramente en JavaScript usando la GEE UI API, sin dependencias externas. El procesamiento corre en la nube de GEE sobre las colecciones oficiales de Landsat (L5/L7/L8/L9, Collection 2 SR, desde 1984) y Sentinel-2 SR Harmonized (desde 2017). El cálculo de la ACF se realiza en el cliente mediante `.evaluate()` una vez extraída la serie como FeatureCollection. La interfaz se organiza en tres paneles: controles a la izquierda, mapa y serie temporal en el centro, y análisis estadístico a la derecha con sistema de pestañas para separar gráfico, resultado e interpretación.

---

**Metodología**

El flujo parte del filtrado de imágenes por fecha, geometría y porcentaje de nubosidad máximo, con enmascarado de nubes por QA_PIXEL (Landsat) o QA60 (Sentinel-2). Sobre esa colección se calculan los índices espectrales aplicando los factores de escala de Collection 2 sobre reflectancia de superficie. Los índices disponibles son NDVI, EVI, SAVI, NDWI y NBR, cada uno orientado a una pregunta diferente sobre la cobertura: estado general de la vegetación, respuesta en zonas densas, corrección del efecto suelo, contenido hídrico o severidad de incendios.

La serie temporal resultante se analiza estadísticamente mediante cuatro módulos. El más relevante metodológicamente es la **función de autocorrelación (ACF)**, que mide la correlación de la serie consigo misma en distintos desfases temporales. Un pico significativo en lag 1 indica que la vegetación tiene inercia: lo que ocurre hoy predice lo que ocurrirá en la siguiente adquisición. Un pico en lag 6 o lag 23 —dependiendo de la cadencia del satélite— revela un ciclo semestral o anual. El umbral de significancia se calcula según el criterio de Bartlett al 95% (±1.96/√n), lo que permite distinguir entre estructura real y ruido estadístico.

La interpretación de la ACF se estructura automáticamente en cuatro bloques: memoria a corto plazo, ciclo estacional con estimación del período en meses, longitud de memoria total y recomendación de modelo. Si la autocorrelación permanece significativa hasta lags altos, la serie tiene memoria larga y probablemente una tendencia no estacionaria que requiere diferenciación antes de modelar. Si hay un pico estacional claro, la estructura es compatible con un modelo SARIMA(p,d,q)(P,D,Q)[s] donde s es el período detectado. La app complementa esto con un análisis de tendencia lineal que aporta la pendiente y el R², y una curva suavizada que permite comparar la amplitud del ciclo estacional entre años.

---

**Comprensión de patrones y proyección**

Lo que hace útil el análisis temporal no es la fotografía de un año sino la estructura que emerge a lo largo de varios ciclos. La ACF permite responder preguntas concretas: ¿es el ciclo estacional de este pastizal estable año a año o su amplitud está decreciendo? ¿La caída de NDVI en 2022 fue un evento puntual o marcó un cambio de régimen? ¿Cuántos meses tarda la vegetación en recuperar sus valores tras un incendio?

Identificada la estructura temporal, el paso natural es el modelado predictivo. Una serie con estacionalidad anual clara y memoria moderada es directamente modelable con SARIMA, cuyo ajuste óptimo puede automatizarse con `auto.arima()` en R o `SARIMAX` en Python sobre el CSV exportado por la app. El modelo resultante permite proyectar valores futuros del índice, construir intervalos de confianza estacionales y detectar anomalías como desviaciones significativas respecto al patrón esperado, lo que equivale a una señal de alerta temprana ante degradación, sequía o cambio de uso del suelo.

---

**Aplicaciones**

La combinación de Landsat desde 1984 con series temporales largas abre un abanico amplio de usos. En el contexto de pastizales y agricultura, permite cuantificar la respuesta de la cobertura vegetal a años secos o húmedos y comparar la dinámica entre parcelas con distinto manejo. En el ámbito forestal, la caracterización fenológica mediante el ciclo anual del NDVI o EVI permite detectar adelantos o retrasos en la brotación asociados a cambios climáticos. Con NBR, el seguimiento post-incendio revela tanto la severidad inicial como la trayectoria de recuperación. En zonas de expansión urbana, la tendencia negativa sostenida en NDVI a lo largo de décadas es un indicador directo de sellado del suelo y pérdida de cobertura vegetal.

En investigación, la exportación CSV permite integrar los resultados en flujos de trabajo más complejos: correlación con datos meteorológicos, validación con trabajo de campo o calibración de modelos de simulación de ecosistemas. En docencia, la app funciona como entorno de demostración interactivo para explicar autocorrelación, estacionalidad y modelado de series temporales sobre datos reales sin necesidad de instalar nada.

---

Desarrollado por Alberto Concejal — Geovisualization.net
PhD candidate, Universidad de Alcalá
