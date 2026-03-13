import sharp from 'sharp';
import fs from 'node:fs';

const files = [
  'src/assets/stand.png',
  'src/assets/customers/customer_1.png',
  'src/assets/customers/customer_2.png',
  'src/assets/cards/card_clock.png',
  'src/assets/cards/card_lemon.png'
];

async function removeBackground() {
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const { data, info } = await sharp(f)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 230 && g > 230 && b > 230) {
          // Make lightly colored/white pixels transparent
          data[i + 3] = 0;
        }
      }

      await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: 4
        }
      })
      .png()
      .toFile(f.replace('.png', '_trans.png'));
      
      fs.renameSync(f.replace('.png', '_trans.png'), f);
      console.log(`Processed transparency for ${f}`);
    } catch (e) {
      console.error(e);
    }
  }
}
removeBackground();
