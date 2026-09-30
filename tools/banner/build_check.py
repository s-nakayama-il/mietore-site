# -*- coding: utf-8 -*-
"""チェックページ B/C（/banner/check/b.html・c.html）を EC repo のテンプレートから組み立てる。

使い方:
    python3 tools/banner/build_check.py

正は EC 側（`ecommerce-project/20_実行/新規獲得/バナー配信/チェックページ試作/`、commit 26adcf2）。
本スクリプトは EC 側を読むだけで、変更しない（`/cp/` と同じ運用）。

EC の組み立て（build_20260928_BC_v2.py）との違いは3点:
  1. 画像を data URI ではなく `/banner/img/` の外部ファイルにする（HTML を小さくする）。
  2. `track()` を、/mm/track へ送る本物の送信関数にする（sendBeacon → no-cors fetch）。
     `param` は D1 の64文字上限に収まる短い形にする。
  3. 入口の試作用バナー（`showBanner()`）を使わず `start()` から始める。
     LP でバナーをタップして来るため、同じバナーをもう一度出す必要がない。
判定式（`Q[k].judge`・`ORDER`・`diagnose()`）と3問の出し方は EC のテンプレートのまま変えない。
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
OUT = R / 'public/banner/check'
EC = Path('/home/nakayama/work/il/projects/ecommerce-project')
SRC = EC / '20_実行/新規獲得/バナー配信/チェックページ試作'
TPL = SRC / 'template_20260928_BC_v2.html'
GEN = EC / '20_実行/新規獲得/バナー配信/バナー/縦_20260928/gen_banners_20260928.py'

IMG = '/banner/img'

# テンプレートの A.<key> を、外部ファイルの URL に置き換える
ASSETS = {
    'dots': f'{IMG}/q1_dots.png',
    'icon': f'{IMG}/icon.png',
    'f_good': f'{IMG}/fukuta_good.png',
    'f_expect': f'{IMG}/fukuta_expect.png',
    'f_komari': f'{IMG}/fukuta_good.png',    # 結果画面では使わない（diagnose() は据え置き）
    'f_iwai': f'{IMG}/fukuta_good.png',
    'b2still': f'{IMG}/b2_pair.webp',
    'kiroku': f'{IMG}/shot_kiroku.webp',
    'stage': f'{IMG}/shot_stage.webp',
    'play': f'{IMG}/shot_play.webp',
    'rule_gif': f'{IMG}/rule.gif',
    'patches': [f'{IMG}/patch{i}.png' for i in range(6)],
}

VARIANTS = {
    'B': dict(title='目のチェック', lastbtn='結果を見る', afterq='result()',
              carddesc='しま模様を見分けるゲーム・無料', storebtn='無料で練習をはじめる',
              version='banner-20260928-B'),
    'C': dict(title='目の見分けチャレンジ', lastbtn='つぎへ', afterq='ruleIntro()',
              carddesc='いま遊んだゲームのアプリ・無料', storebtn='続きを無料で遊ぶ',
              version='banner-20260928-C'),
}

# 計測の送信関数。EC の console.log 版を差し替える。
# param は D1 の64文字上限（validate.ts）に収まる短い形にする。
TRACKER = r'''
// 計測: /mm/track へ送る。sendBeacon（text/plain）が積めなければ no-cors の fetch で送り直す。
// 送信先は、このページ自身の origin から作る（本番 https://mietore.site、プレビューはプレビューの origin）。
const QS=new URLSearchParams(location.search);
const TRACK_URL=location.origin+'/mm/track';
const DEBUG=QS.get('mtr_debug')==='1';
const SID=(function(){let s=QS.get('sid')||'';
  if(!s){try{s=sessionStorage.getItem('mtrb_sid')||''}catch(e){}}
  if(!s){s=String(Math.floor(Math.random()*1e8)).padStart(8,'0')}
  try{sessionStorage.setItem('mtrb_sid',s)}catch(e){}
  return s.slice(0,64)})();
const VER=(QS.get('v')||'__VERSION__').slice(0,64);
function osName(){const ua=navigator.userAgent||'';
  if(/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return 'iOS';
  if(/Android/.test(ua))return 'Android';return 'PC'}
function uaFamily(){const ua=navigator.userAgent||'';
  if(/musical_ly|trill|Bytedance|TTWebView/.test(ua))return 'tiktok';
  if(/ Line\//.test(ua))return 'line';
  if(/Instagram/.test(ua))return 'instagram';
  if(/FBAN|FBAV/.test(ua))return 'facebook';
  if(/; wv\)/.test(ua))return 'wv';return 'browser'}
function track(ev,p){
  const payload={ts:new Date().toISOString(),sid:SID,event:ev,param:String(p==null?'':p).slice(0,64),
    url:location.href,os:osName(),v:VER,ua_family:uaFamily()};
  if(DEBUG){try{console.log('[check]',ev,JSON.stringify(payload))}catch(e){}return}
  const body=JSON.stringify(payload);
  try{if(navigator.sendBeacon&&navigator.sendBeacon(TRACK_URL,new Blob([body],{type:'text/plain'}))===true)return}catch(e){}
  try{const q=fetch(TRACK_URL,{method:'POST',body:body,keepalive:true,mode:'no-cors'});if(q&&q.catch)q.catch(function(){})}catch(e){}}
// タイプ名は param に日本語を入れず番号にする（64文字上限と CSV 対策のため）
const TYPE_NO={'くっきり見分けタイプ':1,'うすい模様が見えにくいタイプ':2,'向きのちがいが見分けにくいタイプ':3,'うすさも向きも見分けにくいタイプ':4};
'''


def dots_number() -> str:
    m = re.search(r"^DOTS_NUMBER = '(\d{4})'", GEN.read_text(encoding='utf-8'), re.M)
    if not m:
        raise SystemExit('DOTS_NUMBER が %s から読めない' % GEN)
    return m.group(1)


def assets_js() -> str:
    import json
    return json.dumps(ASSETS, ensure_ascii=False)


# 送る内容を短い形にする置き換え（EC テンプレートの track 呼び出しを1つずつ書き換える）
CALL_PATCHES = [
    # check_answer: q=問番号;ok=0/1;p=減点;s=秒;t=時間切れ
    ("""  track('check_answer',{q:k,a:btn.textContent,step,ok:r.ok,penalty:r.s,sec,timeOver});""",
     """  track('check_answer','q='+(step+1)+';ok='+(r.ok?1:0)+';p='+r.s+';s='+sec+';t='+(timeOver?1:0));"""),
    # check_result: ty=タイプ番号;lv=;pen=;o=3問の正誤;ts=ラストチャレンジ秒
    ("""  track('check_result',Object.assign({type:d.type,lv:d.lv,penalty_total:d.pen,q:per},VARIANT==='C'?{trial_sec:trialSec}:{}));""",
     """  track('check_result','ty='+(TYPE_NO[d.type]||0)+';lv='+d.lv+';pen='+d.pen
    +';o='+ORDER.map(k=>rec[k].ok?1:0).join('')+(VARIANT==='C'?';ts='+trialSec:''));"""),
    # cta_store: os=;ty=;lv=;ts=
    ("""  view.querySelectorAll('a.btn').forEach(a=>a.addEventListener('click',()=>track('cta_store',
    Object.assign({os:a.dataset.os,type:resType,lv:resLv},VARIANT==='C'?{trial_sec:trialSec}:{}))));""",
     """  view.querySelectorAll('a.btn').forEach(a=>a.addEventListener('click',()=>track('cta_store',
    'os='+a.dataset.os+';ty='+(TYPE_NO[resType]||0)+';lv='+resLv+(VARIANT==='C'?';ts='+trialSec:''))));"""),
    # trial_clear: s=秒;in=目標内か
    ("""    trialSec=Math.round(sec*10)/10;track('trial_clear',{sec:trialSec,within_target:trialSec<=30});""",
     """    trialSec=Math.round(sec*10)/10;track('trial_clear','s='+trialSec+';in='+(trialSec<=30?1:0));"""),
    # 引数なしのイベントは param を空にする
    ("""function start(){track('check_start',{});step=0;ask()}""",
     """function start(){track('check_start','');step=0;ask()}"""),
    ("""function ruleIntro(){window.scrollTo(0,0);bar(ORDER.length/(ORDER.length+1)*100);track('rule_view',{});""",
     """function ruleIntro(){window.scrollTo(0,0);bar(ORDER.length/(ORDER.length+1)*100);track('rule_view','');"""),
    ("""function trial(){track('trial_start',{});""",
     """function trial(){track('trial_start','');"""),
]


def build(variant: str, tpl: str) -> str:
    v = VARIANTS[variant]
    out = tpl
    drop = 'C' if variant == 'B' else 'B'
    out = re.sub(r'/\*@%s\*/.*?/\*@/%s\*/\n?' % (drop, drop), '', out, flags=re.S)

    # 1. 計測の差し替え（console.log 版を消し、送信関数を入れる）
    old_track = ("// 計測の差し込み口（試作では送信せずコンソールに出す）\n"
                 "function track(ev,p){try{console.log('[check]',ev,JSON.stringify("
                 "Object.assign({variant:VARIANT},p||{})))}catch(e){}}")
    assert out.count(old_track) == 1, 'track() の差し替え先が見つからない'
    out = out.replace(old_track, TRACKER.strip().replace('__VERSION__', v['version']))

    for a, b in CALL_PATCHES:
        if a not in out:
            continue          # 版によって存在しない呼び出しがある（trial は C 版だけ）
        out = out.replace(a, b)

    # 2. 実機スクリーンショットは build_images.py で切り出し済みなので、
    #    テンプレートの shot(A.x, 上端, 高さ) の「上端」を0にする（CSS で二重に切らないため）。
    #    resultBody の中だけの置き換えで、判定式（judge・ORDER・diagnose）には触れない。
    def zero_top(m):
        return 'shot(%s,0,%s' % (m.group(1), m.group(3))
    out, n = re.subn(r'shot\((A\.\w+),(\d+),(\d+)', zero_top, out)
    if n == 0:
        raise SystemExit('shot() の切り抜き座標が見つからない')

    # 3. 入口の試作用バナーを使わず、いきなり第1問から始める
    assert out.count('showBanner();') == 1
    out = out.replace('showBanner();', 'start();   // LP でバナーをタップして来るので、試作用の入口は出さない')

    out = (out.replace('__ASSETS__', assets_js())
              .replace('__VARIANT__', variant)
              .replace('__NUM__', NUM)
              .replace('__TITLE__', v['title'])
              .replace('__LASTBTN__', v['lastbtn'])
              .replace('__AFTERQ__', v['afterq'])
              .replace('__CARDDESC__', v['carddesc'])
              .replace('__STOREBTN__', v['storebtn']))
    left = re.findall(r'__[A-Z]+__', out)
    if left:
        raise SystemExit('置き換え漏れ: %s' % set(left))
    return out


NUM = dots_number()
tpl = TPL.read_text(encoding='utf-8')
OUT.mkdir(parents=True, exist_ok=True)
for variant, name in (('B', 'b.html'), ('C', 'c.html')):
    p = OUT / name
    p.write_text(build(variant, tpl), encoding='utf-8')
    print('%s %7d bytes / 隠れ数字 %s' % (name, p.stat().st_size, NUM))
