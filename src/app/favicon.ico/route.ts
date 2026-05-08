export async function GET() {
  // Do not redirect: returning 204 avoids a full-page navigation flash during first load.
  return new Response(null, { status: 204 });
}
