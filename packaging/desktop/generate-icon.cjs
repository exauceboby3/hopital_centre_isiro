const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const width = 512;
const height = 512;
const pixels = Buffer.alloc(width * height * 4, 0);

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3] ?? 255;
}

function circle(cx, cy, radius, color) {
  const left = Math.max(0, Math.floor(cx - radius));
  const right = Math.min(width - 1, Math.ceil(cx + radius));
  const top = Math.max(0, Math.floor(cy - radius));
  const bottom = Math.min(height - 1, Math.ceil(cy + radius));
  const squared = radius * radius;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= squared) setPixel(x, y, color);
    }
  }
}

function line(x1, y1, x2, y2, thickness, color) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(distance));
  const radius = thickness / 2;
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    circle(x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio, radius, color);
  }
}

const cyan = [50, 190, 231, 255];
const blue = [21, 132, 219, 255];
const deepBlue = [33, 73, 177, 255];

// Hexagone technologique extérieur.
line(96, 150, 226, 74, 14, cyan);
line(286, 74, 416, 150, 14, blue);
line(416, 150, 416, 344, 14, deepBlue);
line(416, 344, 286, 420, 14, deepBlue);
line(226, 420, 96, 344, 14, blue);
line(96, 344, 96, 150, 14, cyan);

// Lettre N centrale.
line(176, 344, 176, 180, 54, blue);
line(176, 180, 336, 344, 54, blue);
line(336, 344, 336, 180, 54, deepBlue);

// Circuits et points de connexion.
line(96, 150, 150, 118, 9, cyan);
line(150, 118, 222, 158, 9, cyan);
circle(222, 158, 17, cyan);
line(416, 150, 370, 124, 9, blue);
line(370, 124, 370, 196, 9, blue);
circle(370, 196, 12, blue);
line(96, 344, 142, 370, 9, cyan);
line(142, 370, 142, 300, 9, cyan);
circle(142, 300, 12, cyan);
line(416, 344, 366, 374, 9, deepBlue);
circle(366, 374, 12, deepBlue);

circle(256, 54, 25, cyan);
circle(74, 256, 24, cyan);
circle(438, 256, 24, blue);
circle(256, 446, 25, deepBlue);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const target = y * (width * 4 + 1);
  raw[target] = 0;
  pixels.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
header[10] = 0;
header[11] = 0;
header[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outputDirectory = path.join(__dirname, 'build');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'icon.png'), png);
console.log(`Icône Windows générée : ${width}x${height}.`);
