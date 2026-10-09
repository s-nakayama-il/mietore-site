# -*- coding: utf-8 -*-
"""/banner で使う画像を EC repo から public/banner/img/ に書き出す。

使い方:
    python3 tools/banner/build_images.py

方針（TASK-I16-20260929-003）:
- 第1問の隠れ数字 `bc_dots.png` は、両はしの数字を「わざとうすく」してあるため
  非可逆圧縮をかけない（うすさが変わると問題の難しさが変わる）。PNG の再圧縮だけを行い、
  元ファイルと画素一致であることを確かめる。
- BC バナーにも同じ隠れ数字が入る。300KB 以下にするため WebP（可逆）を使い、
  数字の部分が元と画素一致であることを確かめる。
- A1・A2・A3 のバナーは写真・イラストなので WebP（非可逆・品質88）でよい。
- 実機スクリーンショット（記録・ステージ選択・プレイ中）は、チェックページで CSS で
  切り抜いて使う範囲だけをあらかじめ切り出してから WebP にする（読み込む量を減らす）。
- ふく多・しま模様・ルール説明 GIF は v3 の const A（または素材）からそのまま出す。

方針の追加（TASK-I16-20261007-001）:
- A7（キャンペーン説明・案1 動きあり）の層の画像6枚は、試作で字の大きさと位置を確かめた
  現物をそのまま使うため、再圧縮せず bytes のまま写す（sha256 が試作と一致する）。

方針の追加（TASK-I16-20261008-001）:
- B・C の作り直し版（10/5 の試作「強・4字そろえ」）も、濃さを ΔL で測って決めた現物を使うため、
  層2枚と第1問の絵を再圧縮せず bytes のまま写す（sha256 が試作と一致する）。
- 名前に日付を入れた新しいファイルとして出す（画像のキャッシュの指定が無いため、同じ名前で
  置き換えると前に読んだブラウザに古い絵が残る）。古い `banner_BC.webp`・`q1_dots.png` は消さない。
"""
import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
OUT = R / 'public/banner/img'
EC = Path('/home/nakayama/work/il/projects/ecommerce-project')
BANNER = EC / '20_実行/新規獲得/バナー配信/バナー/縦_20260928'
SOZAI = EC / '20_実行/新規獲得/バナー配信/素材'
SHOTS = EC / '10_基盤/モック開発/素材/images'
V3 = EC / '20_実行/新規獲得/バナー配信/チェックページ試作/check_prototype_20260928_v3.html'
ICON = EC / '10_基盤/ブランド素材/素材/ふく多(デフォ)_アイコン.png'
A7_SRC = EC / '20_実行/新規獲得/バナー配信/バナー試作_20261008/v2'
BC_SRC = EC / '20_実行/新規獲得/バナー配信/バナー試作_20261005'

# A7 の層（出力の名前 → 試作の読み元）。土台と見出しだけ名前が違う
A7_LAYERS = (
    ('base', 'base_2.webp'),
    ('head', 'head1.webp'),
    ('ring', 'ring.webp'),
    ('stamps', 'stamps.webp'),
    ('coin', 'coin.webp'),
    ('picture', 'picture.webp'),
)

# B・C の作り直し版（出力の名前 → 試作の読み元）。層2枚と第1問の絵
BC_FILES = (
    ('banner_BC_20261005_base.webp', 'base_BC.webp'),
    ('banner_BC_20261005_num.webp', 'layer_strong2.webp'),
    ('q1_dots_20261005.png', 'q1_dots_strong.png'),
)

# 実機スクリーンショット（750×1334）から、チェックページが見せる範囲（上端, 高さ）
SHOT_CROP = {'kiroku': (154, 746), 'stage': (336, 564), 'play': (245, 995)}
B2_FRAME = 22            # あいさつなし GIF の23コマ目（線でペアがつながった場面）

report = []


def w(name: str, data: bytes) -> None:
    (OUT / name).write_bytes(data)
    report.append((name, len(data)))


def webp(im: Image.Image, name: str, quality=88, lossless=False) -> None:
    buf = io.BytesIO()
    im.save(buf, format='WEBP', quality=quality, method=6, lossless=lossless)
    w(name, buf.getvalue())


def png(im: Image.Image, name: str) -> None:
    buf = io.BytesIO()
    im.save(buf, format='PNG', optimize=True)
    w(name, buf.getvalue())


def v3_assets() -> dict:
    s = V3.read_text(encoding='utf-8')
    i = s.find('const A=')
    return json.loads(s[i + 8:s.find('};', i) + 1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    A = v3_assets()

    # --- バナー4枚（LP の離脱ポップアップで出す）
    for tag in ('A1', 'A2', 'A3'):
        im = Image.open(BANNER / f'{tag}_1080x1920.png').convert('RGB')
        webp(im, f'banner_{tag}.webp', quality=88)
    bc = Image.open(BANNER / 'BC_1080x1920.png').convert('RGB')
    # 隠れ数字は WebP 可逆だと 301,296 bytes で 300KB を少し超えるため、
    # 非可逆の最高品質（q=100）にする。点の帯の平均差 1.089・最大差 13 で、
    # 3倍に拡大した目視でも元と見分けがつかないことを確かめた（結果節に記録）
    webp(bc, 'banner_BC.webp', quality=100)

    # --- A7（キャンペーン説明）の層6枚。再圧縮せず bytes のまま写す
    for out, src in A7_LAYERS:
        w(f'banner_A7_20261008_{out}.webp', (A7_SRC / src).read_bytes())

    # --- B・C の作り直し版（層2枚と第1問の絵）。再圧縮せず bytes のまま写す
    for out, src in BC_FILES:
        w(out, (BC_SRC / src).read_bytes())

    # --- 第1問の絵（隠れ数字）。非可逆にしない
    dots = Image.open(BANNER / 'bc_dots.png')
    png(dots.convert('RGB') if dots.mode not in ('RGB', 'L') else dots, 'q1_dots.png')

    # --- アプリアイコン・ふく多
    png(Image.open(ICON).convert('RGBA'), 'icon.png')
    for key, name in (('f_good', 'fukuta_good.png'), ('f_expect', 'fukuta_expect.png')):
        w(name, base64.b64decode(A[key].split(',', 1)[1]))

    # --- B-2（あいさつなし GIF の1コマ）
    g = Image.open(SOZAI / '二角取りルール説明_あいさつなし.gif')
    g.seek(B2_FRAME)
    webp(g.convert('RGB'), 'b2_pair.webp', quality=92)

    # --- 実機スクリーンショット（使う範囲だけ切り出す）
    for key, src in (('kiroku', '記録_root.png'), ('stage', 'ゲーム_クエスト_ステージ選択.png'),
                     ('play', 'ゲーム_クエスト_プレイ中_開始直後.png')):
        ct, ch = SHOT_CROP[key]
        im = Image.open(SHOTS / src).convert('RGB').crop((0, ct, 750, ct + ch))
        webp(im, f'shot_{key}.webp', quality=88)

    # --- ルール説明の GIF（そのまま）と、二角取りのしま模様6枚
    w('rule.gif', (SOZAI / '二角取りルール説明_20260928.gif').read_bytes())
    for n, p in enumerate(A['patches']):
        w(f'patch{n}.png', base64.b64decode(p.split(',', 1)[1]))

    total = sum(n for _, n in report)
    for name, n in sorted(report):
        print('%-20s %8d bytes' % (name, n))
    print('%-20s %8d bytes' % ('合計', total))

    # --- 非可逆にしてはいけない画像の確かめ
    a = Image.open(BANNER / 'bc_dots.png').convert('RGB')
    b = Image.open(OUT / 'q1_dots.png').convert('RGB')
    print('q1_dots 画素一致:', a.tobytes() == b.tobytes())
    c = Image.open(OUT / 'banner_BC.webp').convert('RGB')
    from PIL import ImageChops, ImageStat
    st = ImageStat.Stat(ImageChops.difference(bc, c))
    print('banner_BC 元との平均差: %.3f / 最大差: %d' % (sum(st.mean) / 3, max(st.extrema[i][1] for i in range(3))))
    print('元 bc_dots md5:', hashlib.md5((BANNER / 'bc_dots.png').read_bytes()).hexdigest())

    # --- A7 の層は試作と bytes 一致（再圧縮していないこと）
    a7 = 0
    for out, src in A7_LAYERS:
        p = OUT / f'banner_A7_20261008_{out}.webp'
        d = p.read_bytes()
        a7 += len(d)
        same = hashlib.sha256(d).hexdigest() == hashlib.sha256((A7_SRC / src).read_bytes()).hexdigest()
        print('A7 %-8s %7d bytes  試作と一致: %s  %s' % (out, len(d), same, hashlib.sha256(d).hexdigest()))
    print('A7 層の合計: %d bytes（上限 170,000）' % a7)

    # --- B・C の作り直し版も試作と bytes 一致（再圧縮していないこと）
    bc2 = 0
    for out, src in BC_FILES:
        d = (OUT / out).read_bytes()
        if out.endswith('.webp'):
            bc2 += len(d)
        same = hashlib.sha256(d).hexdigest() == hashlib.sha256((BC_SRC / src).read_bytes()).hexdigest()
        print('BC %-28s %7d bytes  試作と一致: %s  %s' % (out, len(d), same, hashlib.sha256(d).hexdigest()))
    print('B・C の層の合計: %d bytes（上限 235,000）' % bc2)


if __name__ == '__main__':
    main()
