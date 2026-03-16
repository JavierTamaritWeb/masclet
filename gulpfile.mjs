// ============================================================
// GULPFILE.MJS – Gulp 5 (ESM) – Masclet Bot Fallero
// Build pipeline con directorios src/ y dist/
// ============================================================
import gulp from 'gulp';
import gulpSass from 'gulp-sass';
import * as dartSass from 'sass';
import autoprefixer from 'gulp-autoprefixer';
import cleanCSS from 'gulp-clean-css';
import rename from 'gulp-rename';
import browserSync from 'browser-sync';
import path from 'node:path';
import sharp from 'sharp';
import { rm, mkdir, readdir } from 'node:fs/promises';

const sass = gulpSass(dartSass);
const bs = browserSync.create();
const MODERN_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const WEBP_OPTIONS = { quality: 55, effort: 6 };
const AVIF_OPTIONS = { quality: 38, effort: 9 };

// ---- Rutas ----
const paths = {
  src: 'src',
  dist: 'dist',
  scss: {
    src: 'src/scss/**/*.scss',
    dest: 'dist/css',
  },
  html: {
    src: 'src/**/*.html',
    dest: 'dist',
  },
  js: {
    src: 'src/js/**/*.js',
    dest: 'dist/js',
  },
  img: {
    src: 'src/img/**/*',
    sourceRoot: 'src/img',
    dest: 'dist/img',
  },
  data: {
    src: 'src/data/**/*',
    dest: 'dist/data',
  }
};

// ---- Compilar SCSS → CSS (dev: expandido + sourcemaps) ----
function compileSass() {
  return gulp
    .src(['src/scss/*.scss', '!src/scss/_*.scss'])
    .pipe(sass({ outputStyle: 'expanded' }).on('error', sass.logError))
    .pipe(autoprefixer({ cascade: false }))
    .pipe(gulp.dest(paths.scss.dest))
    // Generar también minificado de una vez
    .pipe(cleanCSS({ level: 2 }))
    .pipe(rename({ suffix: '.min' }))
    .pipe(gulp.dest(paths.scss.dest))
    .pipe(bs.stream());
}

// ---- Copiar HTML ----
function copyHTML() {
  return gulp.src(paths.html.src).pipe(gulp.dest(paths.html.dest));
}

// ---- Copiar JS ----
function copyJS() {
  return gulp.src(paths.js.src).pipe(gulp.dest(paths.js.dest));
}

// ---- Copiar IMG (con validación de binarios encoding:false en Gulp 5) ----
function copyImg() {
  return gulp.src(paths.img.src, { encoding: false }).pipe(gulp.dest(paths.img.dest));
}

async function collectConvertibleImages(directoryPath) {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const nestedFiles = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return collectConvertibleImages(entryPath);
      }

      if (!entry.isFile()) {
        return [];
      }

      return MODERN_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? [entryPath]
        : [];
    }));

    return nestedFiles.flat();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function getDerivedImageOutputPath(sourceFilePath, extension) {
  const relativePath = path.relative(path.resolve(paths.img.sourceRoot), sourceFilePath);
  const outputRelativePath = relativePath.replace(/\.(png|jpe?g)$/i, `.${extension}`);

  return path.join(path.resolve(paths.img.dest), outputRelativePath);
}

async function convertImage(sourceFilePath, format) {
  const outputFilePath = getDerivedImageOutputPath(sourceFilePath, format);

  await mkdir(path.dirname(outputFilePath), { recursive: true });

  if (format === 'webp') {
    await sharp(sourceFilePath).webp(WEBP_OPTIONS).toFile(outputFilePath);
    return;
  }

  await sharp(sourceFilePath).avif(AVIF_OPTIONS).toFile(outputFilePath);
}

async function generateModernImgFormats() {
  const imageFiles = await collectConvertibleImages(path.resolve(paths.img.sourceRoot));

  await Promise.all(
    imageFiles.flatMap((sourceFilePath) => [
      convertImage(sourceFilePath, 'webp'),
      convertImage(sourceFilePath, 'avif'),
    ])
  );
}

async function cleanDistImg() {
  await rm(paths.img.dest, { recursive: true, force: true });
}

// ---- Copiar Data ----
function copyData() {
  return gulp.src(paths.data.src, { encoding: false }).pipe(gulp.dest(paths.data.dest));
}

// ---- Tarea unificada de copiado de estáticos ----
const buildImages = gulp.series(copyImg, generateModernImgFormats);
const refreshImages = gulp.series(cleanDistImg, buildImages);
const copyStatic = gulp.parallel(copyHTML, copyJS, copyData);
const copy = gulp.parallel(copyStatic, buildImages);

// ---- Limpiar dist para evitar artefactos obsoletos ----
async function cleanDist() {
  await rm(paths.dist, { recursive: true, force: true });
}

// ---- BrowserSync: servidor local en dist/ ----
function serve(cb) {
  bs.init({
    server: { baseDir: paths.dist },
    port: 3000,
    open: true,
    notify: false,
  });
  cb();
}

// ---- BrowserSync Reload ----
function reload(cb) {
  bs.reload();
  cb();
}

// ---- Watch: vigilar cambios en src/ ----
function watchFiles(cb) {
  gulp.watch(paths.scss.src, compileSass);
  gulp.watch(paths.html.src, gulp.series(copyHTML, reload));
  gulp.watch(paths.js.src, gulp.series(copyJS, reload));
  gulp.watch(paths.img.src, { encoding: false }, gulp.series(refreshImages, reload));
  gulp.watch(paths.data.src, { encoding: false }, gulp.series(copyData, reload));
  cb();
}

// ---- Tareas exportadas ----
const build = gulp.series(cleanDist, copy, compileSass);
const dev = gulp.series(build, serve, watchFiles);

export { compileSass as sass, copy, build };
export default dev;
