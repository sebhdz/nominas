import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AVAILABLE_YEARS,
  parsePayrollJSON,
  toPeople,
} from "../../../scripts/search-utils.js";

export function getStaticPaths() {
  return AVAILABLE_YEARS.map((year) => ({ params: { year } }));
}

export async function GET({ params }) {
  const raw = await readFile(
    resolve("data", `sueldo-${params.year}.json`),
    "utf8",
  );
  const people = toPeople(parsePayrollJSON(raw));
  return new Response(JSON.stringify(people), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
