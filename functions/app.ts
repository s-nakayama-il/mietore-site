import { storeUrlFor } from '../src/lib/store';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const target = storeUrlFor(request.headers.get('user-agent'));
  const location = target.startsWith('/') ? new URL(target, request.url).toString() : target;
  return Response.redirect(location, 302);
};
