// Netlify build step: writes public/js/config.js from environment variables.
const fs = require("fs");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("ERROR: set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify > Site configuration > Environment variables.");
  process.exit(1);
}
fs.writeFileSync(
  "public/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`
);
console.log("config.js written for", url);
