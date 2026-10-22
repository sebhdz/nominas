import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AVAILABLE_YEARS } from "../../scripts/search-utils.js";

export function getStaticPaths() {
  return AVAILABLE_YEARS.map((year) => ({ params: { year } }));
}

export async function GET({ params }) {
  const source = await readFile(
    resolve("data", `sueldo-${params.year}.json`),
    "utf8",
  );
  return new Response(source.replace(/:\s*NaN\b/g, ": null"), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
