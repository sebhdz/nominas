import { discoverUniversities, getBenefitBlocks } from '../../../../../lib/payroll.js';

export async function getStaticPaths() {
  const paths = [];
  for (const { id, year } of await discoverUniversities()) {
    for (const { block, records } of await getBenefitBlocks(id, year)) {
      paths.push({ params: { university: id, year, block }, props: { records } });
    }
  }
  return paths;
}

export function GET({ props }) {
  return new Response(JSON.stringify(props.records), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
