import records from "../../../../data/sueldo-2026.json";

export function GET() {
  const people = records.map((record) => ({
    id: record.id_empleado,
    nombre: record.nombre_completo,
    nombres: record.nombre,
    apellidos: [record.primer_apellido, record.segundo_apellido]
      .filter(Boolean)
      .join(" "),
    puesto: record.denominacion_cargo,
    puesto_base: record.descripcion_puesto,
    area: record.area_adscripcion,
    bruto: record.remuneracion_bruta_mensual,
    neto: record.remuneracion_neta_mensual,
  }));
  return new Response(JSON.stringify(people), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
