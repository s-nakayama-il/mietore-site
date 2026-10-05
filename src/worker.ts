import { onRequest as appOnRequest } from '../functions/app.ts';
import { onRequest as trackOnRequest } from '../functions/mm/track.ts';
import { onRequestGet as statsOnRequestGet } from '../functions/mm/stats.ts';
import { handleBannerStats } from './routes/banner-stats.ts';
import { handleBannerConfig } from './routes/banner-config.ts';

interface Env {
  DB: D1Database;
  STATS_KEY?: string;
  BANNER_STATS_USER?: string;
  BANNER_STATS_PASS?: string;
  ASSETS: Fetcher;
}

// Pages Functions の3ファイルを無改変で呼ぶため、EventContext と同じ形の context を組む。
// params・data・waitUntil・passThroughOnException・next は3つの関数とも使っていないが、型に合わせて全部渡す。
function pagesContextFor<E>(
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: E & { ASSETS: { fetch: typeof fetch } },
  ctx: ExecutionContext,
  functionPath: string,
): EventContext<E, string, Record<string, unknown>> {
  return {
    request,
    functionPath,
    waitUntil: (promise) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    next: () => env.ASSETS.fetch(request),
    env,
    params: {},
    data: {},
  };
}

// 入口。静的ファイルに合うリクエストは Worker を通らず assets から返る（Workers static assets の既定）。
// ここに来るのは、静的ファイルに合わないリクエストだけ。パスは完全一致で見る（クエリは見ない）。
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/app') {
      return appOnRequest(pagesContextFor(request, env, ctx, '/app'));
    }
    if (pathname === '/mm/track') {
      return trackOnRequest(pagesContextFor(request, env, ctx, '/mm/track'));
    }
    if (pathname === '/mm/stats' && request.method === 'GET') {
      // stats.ts の Env は STATS_KEY を必須にしている。未設定なら関数側が 403 を返す（Pages と同じ）。
      const statsEnv = env as Env & { STATS_KEY: string };
      return statsOnRequestGet(pagesContextFor(request, statsEnv, ctx, '/mm/stats'));
    }
    if (pathname === '/mm/banner-stats') {
      // GET・HEAD 以外（405）と認証は、道の中で見る
      return handleBannerStats(request, env);
    }
    if (pathname === '/banner/config') {
      // GET・HEAD 以外（405）は道の中で見る。/banner/config/ など完全一致しないパスは ASSETS に回る
      return handleBannerConfig(request, env);
    }
    // /mm/stats の GET 以外（Pages でも関数を通らず静的の 404 になる）と、それ以外すべて
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { pagesContextFor };
