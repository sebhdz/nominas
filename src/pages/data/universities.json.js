import { discoverUniversities } from '../../lib/payroll.js';
import { discoverPensionDatasets } from '../../lib/pensions.js';

export async function GET() {
  const pensionDatasets = await discoverPensionDatasets();
  const pensionById = new Map(pensionDatasets.map(({ id, url }) => [id, url]));
  const universities = (await discoverUniversities()).map((university) => ({
    ...university,
    pensionUrl: pensionById.get(university.id) || null,
  }));
  return new Response(JSON.stringify(universities), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
