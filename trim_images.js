import sharp from 'sharp';
import fs from 'node:fs';

const files = [
  'src/assets/stand.png',
  'src/assets/customers/customer_1.png',
  'src/assets/customers/customer_2.png',
  'src/assets/cards/card_clock.png',
  'src/assets/cards/card_lemon.png'
];

async function processImages() {
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        console.log(`Processing: ${f}`);
        await sharp(f)
          .trim({
            background: { r: 255, g: 255, b: 255, alpha: 1 },
            threshold: 50
          })
          .toFile(f.replace('.png', '_trimmed.png'));
        fs.renameSync(f.replace('.png', '_trimmed.png'), f);
        console.log(`Successfully trimmed: ${f}`);
      } catch (err) {
        console.error(`Error processing ${f}:`, err);
      }
    }
  }
}

processImages();
