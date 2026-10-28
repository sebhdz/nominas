import { discoverPensionDatasets } from '../../../lib/pensions.js';

export async function getStaticPaths() {
  return (await discoverPensionDatasets()).map(({ id }) => ({ params: { university: id } }));
}

export async function GET({ params }) {
  const dataset = (await discoverPensionDatasets()).find((item) => item.id === params.university);
  if (!dataset) return new Response(null, { status: 404 });
  return new Response(JSON.stringify({ records: dataset.records }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
