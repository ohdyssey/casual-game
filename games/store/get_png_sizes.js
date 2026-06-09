const fs = require('fs');
function getPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  const w = buf.readInt32BE(16);
  const h = buf.readInt32BE(20);
  return { w, h };
}
console.log('shelf:', getPngSize('public/assets/store/CG_ST_BG_02.png'));
console.log('shelf12:', getPngSize('public/assets/store/CG_ST_BG_02-1.png'));
console.log('shelf9:', getPngSize('public/assets/store/CG_ST_BG_02-2.png'));
