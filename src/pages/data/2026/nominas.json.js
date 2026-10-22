import source from "../../../../data/2026/sueldo-2026.json?raw";

export function GET() {
  return new Response(source, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
