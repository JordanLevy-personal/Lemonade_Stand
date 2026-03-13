import sharp from 'sharp';
import fs from 'node:fs';

const files = ['src/assets/stand_tier_1.png', 'src/assets/stand_tier_3.png'];

async function processImages() {
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        await sharp(f).trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 50 }).toFile(f.replace('.png', '_trimmed.png'));
        fs.renameSync(f.replace('.png', '_trimmed.png'), f);
        
        const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) {
            data[i + 3] = 0;
          }
        }
        await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(f.replace('.png', '_trans.png'));
        fs.renameSync(f.replace('.png', '_trans.png'), f);
        console.log('Processed transparency for ' + f);
      } catch (err) { console.error('Error', f, err); }
    }
  }
}
processImages();
