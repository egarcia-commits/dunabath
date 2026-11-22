# DUNA Bath — sitio web (borrador)

Borrador estático de [dunabath.com](https://www.dunabath.com) para revisión. Idioma principal: español. Versión en inglés en `/en/`.

**Vista previa en GitHub Pages:** https://egarcia-commits.github.io/dunabath/

Este repositorio es independiente de DUNADRON y de `egarcia-commits.github.io`. No está indexado (`noindex`, `robots.txt` Disallow).

## Qué es

DUNA Bath, marca de WSO Operations S.L., vende kits de herrajes para fabricar mamparas de baño. El vidrio no va en la caja: se pide por separado o a un cristalero local. Colección Slim: 25 selecciones. Pedido mínimo: 50 kits por modelo.

## Cómo se genera

```bash
node build.js          # escribe dist/
npm run preview        # http://127.0.0.1:4173/dunabath/
```

Sin dependencias de npm. Contenido en `site.config.json`, `content/i18n.json` y `content/products.json`. Imágenes y fuentes en `public/`.

## Correo provisional

En este borrador el correo es `ventas@dunabath.com`. Hay que confirmarlo antes de la web definitiva. El catálogo PDF de `public/downloads/` sustituye la dirección personal del documento original por esa dirección provisional.

## Publicar el borrador

El contenido de `dist/` se publica en la rama `gh-pages` (GitHub Pages, raíz del proyecto). Tras cambiar el sitio:

```bash
node build.js
git add -A && git commit -m "…" && git push
git subtree split --prefix dist -b gh-pages-new
git push -f origin gh-pages-new:gh-pages
git branch -D gh-pages-new
```

## Pendiente antes de producción

- Confirmar el correo (y, si aplica, teléfono o WhatsApp).
- Revisión jurídica del aviso legal y de la política de privacidad.
- Precios, acabados, plazos, certificaciones y fichas técnicas: no se han inventado y no figuran en la web.
- Cómo se publicará en dunabath.com (el dominio está en Bluehost).
