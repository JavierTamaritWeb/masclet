# Masclet

Masclet es un chatbot sobre las Fallas de València con dos superficies de uso:

- una demo completa en `src/index.html`
- un widget standalone en `src/chatbot.html`, pensado para cargarse dentro de un `iframe`

El proyecto combina coincidencia directa, búsqueda difusa con Fuse.js y sugerencias guiadas sobre una base de conocimiento multilenguaje centralizada en `src/data/knowledge.json`.

## Qué incluye

- Selector de idioma con soporte para `es`, `va`, `en` y `fr`.
- Persistencia de idioma activo en navegador.
- Motor de respuesta en tres capas: coincidencia directa, Fuse.js y fallback guiado.
- Base de conocimiento única con bloques por idioma y categorías anidadas.
- Widget embebible mediante `window.MascletEmbed.init()` o atributos `data-*`.
- Suite Jest para validar matching, Fuse y helpers de idioma.

## Requisitos

- Node.js 18 o superior.
- npm.

## Arranque rápido

```bash
npm install
npm run dev
```

`npm run dev` ejecuta Gulp en modo desarrollo, genera `dist/`, arranca BrowserSync en `http://localhost:3000` y vigila cambios en `src/`.

## Scripts disponibles

| Script | Qué hace |
| :----- | :------- |
| `npm run dev` | Ejecuta la tarea por defecto de Gulp: limpia y reconstruye `dist/`, arranca BrowserSync y observa cambios en HTML, JS, SCSS, imágenes y datos. |
| `npm run build` | Limpia `dist/`, copia recursos estáticos y compila todos los entrypoints SCSS a CSS expandido y minificado. |
| `npm run sass` | Recompila solo `src/scss/*.scss` excepto parciales `_*.scss` y deja los resultados en `dist/css`. |
| `npm test` | Ejecuta la suite Jest de NLP y helpers del runtime. |

## Estructura del proyecto

```text
src/
  index.html            # demo principal
  chatbot.html          # versión standalone para iframe
  data/knowledge.json   # base de conocimiento multilenguaje
  img/                  # recursos estáticos
  js/app.js             # runtime del chat, idiomas y motor de búsqueda
  js/masclet-embed.js   # loader del widget embebible
  scss/                 # estilos fuente
tests/
  nlp.test.js           # regresiones del motor de matching
gulpfile.mjs            # pipeline de build y servidor local
package.json            # scripts y dependencias de desarrollo
```

## Cómo funciona el build

- El build no transpila ni empaqueta JavaScript: copia `src/**/*.js` tal cual a `dist/js`.
- Los HTML cargan dependencias de navegador por CDN: Fuse.js, Lodash, Compromise y Lucide.
- Gulp compila cada archivo SCSS de primer nivel en `src/scss/` y genera versión expandida y `.min.css`.
- `src/data/` se copia íntegro a `dist/data`.
- `dist/` se elimina antes de cada build para evitar artefactos obsoletos.

No edites `dist/` manualmente. Siempre trabaja sobre `src/`.

## Base de conocimiento multilenguaje

`src/data/knowledge.json` tiene un bloque por idioma (`es`, `va`, `en`, `fr`). Cada bloque puede incluir:

- `knowledgeBase`: respuestas generales y de entrada.
- `defaultFollowUps`: sugerencias base para fallback.
- categorías anidadas como `vestimenta`, `comidaTipica`, `festejosReligiosos`, `festejosPopulares`, `monumentos` o `puestosPersonal`.

El runtime aplana el árbol de forma recursiva, así que una entrada puede vivir en `knowledgeBase` o dentro de una subcategoría sin cambiar la forma de búsqueda.

Ejemplo mínimo:

```json
{
  "es": {
    "knowledgeBase": [
      {
        "trigger": "hola masclet",
        "keywords": ["saludo", "inicio"],
        "answer": ["Hola, soy Masclet."],
        "followUps": ["Pregúntame por la mascletà"]
      }
    ],
    "defaultFollowUps": ["¿Qué es la plantà?"]
  }
}
```

Campos soportados por entrada:

- `trigger`: string, array de strings o `RegExp`.
- `answer` o `text`: string o array de respuestas.
- `keywords`: términos adicionales para Fuse.js.
- `followUps` o `followUp`: sugerencias relacionadas.
- `image` o `imagen`, `images`, `video`, `videos`: media opcional. Si se usan arrays, el runtime consume el primer elemento.

## Reglas para mantener `knowledge.json`

- Usa texto plano en `trigger` para coincidencias literales o casi literales. El runtime lo convierte a una regex acotada.
- Usa `regex:` cuando necesites una familia de expresiones. Ejemplo: `regex:^\\s*(hola|buenas)\\s*$`.
- Los patrones heredados con metacaracteres regex sin prefijo siguen funcionando, pero para entradas nuevas conviene usar `regex:` de forma explícita.
- No conviertas la capa directa en una bolsa de intenciones amplias. Para cobertura semántica adicional, añade `keywords` y deja el trabajo a Fuse.js.
- Mantén separadas las familias de saludo nominal, saludo genérico y bienestar en cada idioma para evitar colisiones.
- Si añades un idioma nuevo, no basta con tocar `knowledge.json`: también hay que ampliar `LANGUAGE_CONFIGS` en `src/js/app.js` y añadir la opción al selector en `src/index.html` y `src/chatbot.html`.

## Flujo de respuesta

1. Capa 1, coincidencia directa.
   Se evalúan los `trigger` ya compilados. Está pensada para preguntas exactas, identidades, saludos y patrones controlados.
2. Capa 2, búsqueda difusa con Fuse.js.
   Usa una combinación ponderada de trigger, keywords, texto normalizado y follow-ups.
3. Capa 3, fallback guiado.
   Si no hay coincidencia clara, el runtime reutiliza `followUps` de los mejores candidatos y, si hace falta, completa con sugerencias estáticas localizadas.

Parámetros útiles de runtime:

- `lang=es|va|en|fr`: fuerza el idioma inicial.
- `kbUrl=/ruta/al/knowledge.json`: sobreescribe la URL de la base de conocimiento.
- `debugFuse=1`: activa logging de depuración.
- `fuseDirect=0.60`: ajusta temporalmente el umbral de respuesta directa.
- `fuseGuidance=0.78`: ajusta temporalmente el umbral de sugerencias.

El idioma activo se persiste en `localStorage` bajo la clave `masclet:language`. Las sesiones de depuración Fuse se guardan en `masclet:fuse-log`.

## Widget embebible

Tras `npm run build`, el paquete mínimo para incrustar Masclet en otra web es:

- `dist/chatbot.html`
- `dist/css/chatbot.min.css`
- `dist/js/masclet-embed.js`
- `dist/data/knowledge.json` si quieres servir la base desde el mismo despliegue

Ejemplo con autoarranque:

```html
<script
  src="https://tu-dominio.com/masclet/js/masclet-embed.js"
  data-masclet-auto-init="true"
  data-masclet-language="va"
  data-masclet-iframe-path="chatbot.html"
  data-masclet-kb-url="data/knowledge.json"
  data-masclet-open-label="Obrir Masclet"
  data-masclet-close-label="Tancar Masclet">
</script>
```

Ejemplo programático:

```html
<script src="https://tu-dominio.com/masclet/js/masclet-embed.js"></script>
<script>
  window.MascletEmbed.init({
    language: 'en',
    iframePath: 'chatbot.html',
    kbUrl: 'data/knowledge.json',
    openByDefault: true,
    width: 420,
    height: 720
  });
</script>
```

Opciones soportadas por el loader:

- `language`
- `iframePath`
- `kbUrl`
- `openByDefault`
- `bottom`
- `right`
- `width`
- `height`
- `zIndex`
- `title`
- `openLabel`
- `closeLabel`
- `mount`
- `basePath`

`window.MascletEmbed.init()` reutiliza la instancia existente si el widget ya está montado.

## Accesibilidad y UI

- El chat usa regiones vivas (`role="log"` y `aria-live="polite"`) para anunciar mensajes.
- Botones y toggles actualizan etiquetas ARIA según idioma y estado.
- La metadata visible y documental de la página se localiza desde `LANGUAGE_CONFIGS.page`.
- `chatbot.html` ejecuta el runtime en modo estático y `index.html` en modo minimizable.

## Flujo recomendado para cambios

1. Edita siempre `src/`.
2. Si tocas estilos o estructura, prueba `npm run dev`.
3. Si tocas matching, idiomas o `knowledge.json`, añade o ajusta tests en `tests/nlp.test.js`.
4. Valida siempre con:

```bash
npm test
npm run build
```

## Estado del proyecto

La suite actual cubre matching directo, Fuse, helpers de idioma y regresiones multilenguaje en `tests/nlp.test.js`.
