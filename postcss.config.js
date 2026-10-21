import autoprefixer from 'autoprefixer';

// Autoprefixer reads the support floor from .browserslistrc and adds (and prunes)
// vendor prefixes automatically, so SCSS no longer needs hand-written -webkit- rules.
// Runs after Dart Sass in the build:style / build:skins npm scripts.
export default {
  plugins: [autoprefixer()],
};
