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
import { rm } from 'node:fs/promises';

const sass = gulpSass(dartSass);
const bs = browserSync.create();

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

// ---- Copiar Data ----
function copyData() {
  return gulp.src(paths.data.src, { encoding: false }).pipe(gulp.dest(paths.data.dest));
}

// ---- Tarea unificada de copiado de estáticos ----
const copyStatic = gulp.parallel(copyHTML, copyJS, copyImg, copyData);

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
  gulp.watch(paths.img.src, { encoding: false }, gulp.series(copyImg, reload));
  gulp.watch(paths.data.src, { encoding: false }, gulp.series(copyData, reload));
  cb();
}

// ---- Tareas exportadas ----
const build = gulp.series(cleanDist, copyStatic, compileSass);
const dev = gulp.series(build, serve, watchFiles);

export { compileSass as sass, copyStatic as copy, build };
export default dev;
