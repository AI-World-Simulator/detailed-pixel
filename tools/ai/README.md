# ИИ-слой: открытые модели поверх нашей раскладки

Модель: **Z-Image-Turbo** (Tongyi-MAI, лицензия Apache-2.0), локально через [mflux](https://github.com/filipstrand/mflux) (MLX, Apple Silicon).

```bash
uv tool install --python 3.12 mflux     # ~20 ГБ весов скачаются при первом запуске
PY=~/.local/share/uv/tools/mflux/bin/python
```

## Запечённый район (то, что сейчас в карте)
1. Рендер нашего движка на z20 с привязкой к сетке тайлов (без браузера):
   `TX0=633841 TY0=327786 node tools/render.js genall.js kr20.bmp 0 0 20 32 24` → PNG 4096×3072
   (genall.js = schemas.js + gen.js с подставленным street.js, как в build.js).
2. Бесшовная перерисовка всего холста (MultiDiffusion img2img, окна 1536×1024):
   `$PY tools/ai/bake.py kr20.png kr20_baked.png --prompt-file tools/ai/prompt_kremlin.txt --strength 0.6 --seed 7`
   В mflux `strength` наоборот: чем больше, тем ближе к исходнику; 0.6 сохраняет улицы, площади и дома.
3. Нарезка: `python tools/ai/slice.py kr20_baked.png baked/kremlin_ 1024 96` → `baked/kremlin_{i}_{j}.webp`.
4. Регион описан в `BAKED` в src/main.js (z, тайловый угол, число кусков).

## Вариант А (спрайты и текстуры в движке)
`zgen.py` — пакетная генерация листов; `sprites.py cut` — вырезка спрайтов; `pack.py` — атлас (кроны, текстуры крыш, полосы фасадов).
Движок (src/street.js) берёт атлас из `GEN.init({spr})`; без атласа рисует как раньше. В сборку атлас пока не включён.
