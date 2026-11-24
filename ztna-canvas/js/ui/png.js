/* Rasterises an exported SVG string to a PNG Blob using an offscreen canvas. */
(function (Z) {
  'use strict';

  function svgSize(svg) {
    const w = /<svg[^>]*\swidth="(\d+)"/.exec(svg);
    const h = /<svg[^>]*\sheight="(\d+)"/.exec(svg);
    return { w: w ? Number(w[1]) : 800, h: h ? Number(h[1]) : 600 };
  }

  function svgToPngBlob(svg, scale) {
    const k = scale || 2;
    const size = svgSize(svg);
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.onload = function () {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size.w * k;
          canvas.height = size.h * k;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('PNG 编码失败'));
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('SVG 图像加载失败')); };
      img.src = url;
    });
  }

  Z.png = { svgToPngBlob: svgToPngBlob, svgSize: svgSize };
})(globalThis.ZTNA = globalThis.ZTNA || {});
