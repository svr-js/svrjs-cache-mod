const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/index.js"],
  bundle: true,
  outfile: "dist/mod.js", // Mod output file
  platform: "node",
  target: "es2017",
}).catch((err) => {
  throw err;
});