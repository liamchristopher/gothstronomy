// Loads the real gothstronomy.db (a standard, unmodified SQLite3 file) at
// runtime via sql.js (SQLite compiled to WebAssembly) and queries it with
// plain SQL. The .db file is the single source of truth for stage
// content -- nothing here duplicates or converts it ahead of time.

const SQLJS_JS = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
const SQLJS_WASM = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (existing.dataset.loaded === "true") resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Fetches gothstronomy.db and returns every row of the `constellations`
 * table as plain JS objects, in id order (i.e. the canonical order the
 * database was built in).
 */
export async function loadConstellations(dbUrl = "../gothstronomy.db") {
  if (typeof window.initSqlJs !== "function") {
    await loadScriptOnce(SQLJS_JS);
  }
  const SQL = await window.initSqlJs({ locateFile: () => SQLJS_WASM });

  const response = await fetch(dbUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch ${dbUrl}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const db = new SQL.Database(bytes);

  let rows;
  try {
    const result = db.exec(`
      SELECT name, goth_title, cardinality, happiness, season, colors,
             tarot_mapping, astrological_mapping
      FROM constellations
      ORDER BY id;
    `);
    if (!result.length) {
      rows = [];
    } else {
      const { columns, values } = result[0];
      rows = values.map((row) => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        obj.colorList = obj.colors.split(",").map((s) => s.trim());
        return obj;
      });
    }
  } finally {
    db.close();
  }

  if (rows.length !== 88) {
    console.warn(`Expected 88 constellations, loaded ${rows.length}.`);
  }
  return rows;
}
