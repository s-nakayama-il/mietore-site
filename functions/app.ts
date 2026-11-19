import { storeUrlFor } from '../src/lib/store';

export const onRequest: PagesFunction = async ({ request }) => {
  const entry = new URL(request.url).searchParams.get('c');
  const target = storeUrlFor(request.headers.get('user-agent'), entry);
  const location = target.startsWith('/') ? new URL(target, request.url).toString() : target;
  return Response.redirect(location, 302);
};
