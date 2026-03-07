# 🎆 Masclet Bot Fallero

**Tu asistente virtual interactivo sobre las Fallas de València**

[![Construido con SASS](https://img.shields.io/badge/Sass-C69-white.svg?style=flat&logo=sass)](https://sass-lang.com/)
[![Automatizado con Gulp 5](https://img.shields.io/badge/Gulp-CF4647-white.svg?style=flat&logo=gulp)](https://gulpjs.com/)
[![Íconos Lucide](https://img.shields.io/badge/Lucide-Icons-F472B6.svg?style=flat&logo=lucide)](https://lucide.dev/)
[![Búsquedas con Fuse.js](https://img.shields.io/badge/Fuse.js-B9E0CD-black.svg?style=flat)](https://fusejs.io/)
[![Accesibilidad Lista](https://img.shields.io/badge/A11y-✓-success.svg?style=flat)](#%EF%B8%8F-accesibilidad-a11y)

---

Masclet Bot es un chatbot diseñado con una arquitectura moderna que emplea un motor de búsqueda difusa (`Fuse.js`) y semántica del lenguaje para ofrecer respuestas relacionadas con cultura, eventos, gastronomía y monumentos de las Fallas.

Destaca por su **diseño Glassmorphism premium**, animaciones CSS fluidas (como indicadores de "escribiendo" y sombras reactivas), y un sistema dinámico de íconos vectorizados con **Lucide**, garantizando una experiencia de usuario (UX) inmersiva y de vanguardia.

## 🚀 Arquitectura del Proyecto

El código está estructurado mediante un pipeline de compilado optimizado usando **Gulp 5 (ES Modules)** y **Dart Sass**, dividiendo claramente el entorno de desarrollo y el de producción.

### 📂 `src/` (Entorno de Desarrollo)

Aquí se encuentra todo el código fuente que deberás editar. Gulp se encarga de procesar esta carpeta:

- **`scss/`**: Estilos modulares organizados bajo la arquitectura 7-1 adaptada y nomenclatura **BEM**.
  - `abstracts/_variables.scss`: Modifica aquí los **Tokens de Diseño** (colores, sombras, tipografías, variables de animación).
  - `abstracts/_mixins.scss`: Mixins utilitarios para media queries y accesibilidad.
  - `components/`: Contiene los bloques aislados (`.chatbot`, `.message`, `.input-area`).
  - **Uso de Módulos (Dart Sass)**: En los componentes, las variables se importan y usan con el espacio de nombres `v.` (ej. `v.$spacing-10`) y los mixins con `m.` (ej. `@include m.smooth-transition`).
- **`js/`**:
  - `app.js`: Script principal con Lógica UI (incluyendo la inyección dinámica de íconos **Lucide**), procesamiento de inputs y NLP.
- **`data/`**:
  - `knowledgeBase.json`: Base de conocimiento principal que alimenta las respuestas del bot.
- **`img/`**: Assets estáticos (avatares, etc).
- **`index.html`**: Estructura principal con HTML Semántico. Mantiene enlaces relativos internos apuntando a las futuras versiones compiladas.

### 📦 `dist/` (Entorno de Producción)

> [!WARNING]
> **No edites los archivos de esta carpeta.** Son el resultado directo de la compilación.

Cuando ejecutas las tareas de construcción, Gulp compila SCSS a CSS minificado (`css/main.min.css`) y copia el resto de recursos idénticos (`js/`, `data/`, `index.html`) dentro de `dist/`, dejándolo listo para su despliegue en producción.

---

## 🛠 Instalación y Uso (NPM + Gulp)

Requiere disponer de **Node.js (v18+)** en el sistema para usar Gulp 5 en modo ESM.

### 1. Instalar dependencias

Instala todas las herramientas de compilación con:

```bash
npm install
```

### 2. Comandos Disponibles

| Comando de Terminal | Qué hace internamente | Resultado Interfaz |
| :------------------ | :-------------------- | :----------------- |
| `npm run dev` o `npx gulp dev` | Inicia `BrowserSync` en `http://localhost:3000` sirviendo desde `dist/`. Vigila en tiempo real todos los cambios que hagas en `src/` (HTML, JS, SCSS) e inyecta las actualizaciones en el navegador al momento. | ⚡️ Entorno de Trabajo |
| `npm run build` o `npx gulp build` | Ejecuta el pipeline final: Limpia/copia recursos de `src/` a `dist/` y compila + minifica el SCSS hacia `dist/css/main.min.css`. | 🏗 Listo para Producción |
| `npm run sass` o `npx gulp sass` | Compila exclusivamente tus archivos analíticos `.scss` hacia `.css` expandido y minificado dentro de `dist/`. | 🎨 CSS Actualizado |

---

## 🎨 Estilos y Nomenclatura (BEM)

Para evitar colisión de especificidades de estilos y propiciar escalabilidad, todo el proyecto SCSS se rige bajo la metodología **BEM** (Block__Element--Modifier).

Ejemplos principales aplicados:

- **Bloques** (`.chatbot`, `.message`, `.input-area`).
- **Elementos** (`.chatbot__header`, `.input-area__send`).
- **Modificadores** (`.chatbot--minimized`, `.message--user`, `.message--bot`).

---

## ♿️ Accesibilidad (A11y)

El proyecto está diseñado pensando en todos los usuarios, incluyendo las siguientes integraciones semánticas de base:

- **Etiquetas ARIA dinámicas** (`aria-expanded`, `aria-label`) para anunciar el estado del acordeón o widget de chat.
- **Zonas Vivas (Live Regions)** (`aria-live="polite"` y `role="log"`) alrededor del historial para que los lectores de pantalla puedan leer nuevos mensajes entrantes rítmicamente.
- **Estados Activos y de Foco** definidos con el pseudo-elemento `:focus-visible` (disponible por mixins en SCSS) para potenciar visualmente el flujo a través del teclado sin alterar los clics del ratón.
