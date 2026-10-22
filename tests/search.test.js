import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AVAILABLE_YEARS,
  findPeople,
  isProfessor,
  parsePayrollJSON,
  toPeople,
} from "../src/scripts/search-utils.js";

const records = parsePayrollJSON(
  await readFile(new URL("../data/sueldo-2026.json", import.meta.url), "utf8"),
);
const people = toPeople(records);

test("busca con acentos y palabras en distinto orden; acepta área y puesto", () => {
  assert.ok(
    findPeople(people, " REYNÓSO délia ALMEIDA ").some(
      (person) => person.id === 549092,
    ),
  );
  assert.ok(
    findPeople(people, "délia protocolo").some(
      (person) => person.id === 549092,
    ),
  );
  assert.deepEqual(findPeople(people, "zzzzPersonaInexistente"), []);
});

test("los filtros de puesto son complementarios y usan la descripción publicada", () => {
  const professors = findPeople(people, "", { group: "professors" });
  const others = findPeople(people, "", { group: "others" });
  assert.ok(professors.length > 0 && others.length > 0);
  assert.equal(professors.length + others.length, people.length);
  assert.ok(professors.every(isProfessor));
  assert.ok(others.every((person) => !isProfessor(person)));
  assert.ok(
    isProfessor({
      puesto_base: "PROF. INVEST. TITULAR",
      puesto: "JEFE/A DE DEPARTAMENTO",
    }),
  );
});

test("combina búsqueda, área, tipo de puesto y mayor sueldo bruto", () => {
  const matches = findPeople(people, "prof", {
    area: "BIOLOGIA",
    group: "professors",
  });
  assert.ok(matches.length > 0);
  assert.ok(
    matches.every(
      (person) => person.area === "BIOLOGIA" && isProfessor(person),
    ),
  );
  assert.ok(
    matches.every(
      (person, index) =>
        index === 0 || matches[index - 1].bruto >= person.bruto,
    ),
  );
});

test("ordena por bruto descendente de forma predeterminada, también al buscar", () => {
  for (const query of ["", "prof", "rector"]) {
    const matches = findPeople(people, query);
    assert.ok(matches.length > 0);
    assert.ok(
      matches.every(
        (person, index) =>
          index === 0 || matches[index - 1].bruto >= person.bruto,
      ),
    );
  }
});

test("ordena de menor a mayor, también con búsqueda y filtros", () => {
  for (const options of [
    { order: "asc" },
    { order: "asc", area: "BIOLOGIA", group: "professors" },
  ]) {
    const matches = findPeople(people, "", options);
    assert.ok(matches.length > 1);
    assert.ok(
      matches.every(
        (person, index) =>
          index === 0 || matches[index - 1].bruto <= person.bruto,
      ),
    );
  }
});

test("carga y deduplica por persona usando el registro más reciente en todos los años (2022–2026)", async () => {
  for (const year of AVAILABLE_YEARS) {
    const raw = await readFile(
      new URL(`../data/sueldo-${year}.json`, import.meta.url),
      "utf8",
    );
    const yearRecords = parsePayrollJSON(raw);
    const yearPeople = toPeople(yearRecords);
    const uniqueIds = new Set(yearPeople.map((person) => person.id));
    assert.ok(yearPeople.length > 0);
    assert.equal(uniqueIds.size, yearPeople.length);
    const delia = findPeople(yearPeople, "DELIA ALMEIDA REYNOSO");
    assert.equal(delia.length, 1);
    assert.ok(delia[0].bruto > 0 && delia[0].neto > 0);
  }
});
