const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// SVG design for Nur+ Brand Icon
const svgIcon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064E3B" />
      <stop offset="50%" stop-color="#047857" />
      <stop offset="100%" stop-color="#022C22" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#047857" stop-opacity="0" />
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Background base -->
  <rect width="1024" height="1024" rx="230" fill="url(#bgGrad)" />

  <!-- Subtle Islamic geometric border pattern -->
  <rect x="36" y="36" width="952" height="952" rx="200" fill="none" stroke="url(#goldGrad)" stroke-width="6" stroke-opacity="0.35" />

  <!-- Radiant Light Glow behind the crescent -->
  <circle cx="512" cy="460" r="340" fill="url(#glow)" />

  <!-- Crescent Moon Symbol -->
  <g filter="url(#shadow)" transform="translate(512, 430)">
    <!-- Crescent Body -->
    <path d="M 50 -190 A 210 210 0 1 0 160 160 A 170 170 0 1 1 50 -190 Z" fill="url(#goldGrad)" />
    <!-- 8-pointed star in the crescent -->
    <g transform="translate(75, -50) scale(0.65)">
      <polygon points="0,-75 22,-22 75,-22 33,12 50,65 0,33 -50,65 -33,12 -75,-22 -22,-22" fill="url(#goldGrad)" />
    </g>
  </g>

  <!-- Text: NUR+ -->
  <g filter="url(#shadow)">
    <text x="512" y="810" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="160" 
          font-weight="900" 
          letter-spacing="6"
          fill="#FFFFFF" 
          text-anchor="middle">NUR<tspan fill="url(#goldGrad)">+</tspan></text>
  </g>
</svg>
`;

// Circular icon for round launcher
const svgRoundIcon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064E3B" />
      <stop offset="50%" stop-color="#047857" />
      <stop offset="100%" stop-color="#022C22" />
    </linearGradient>
    <linearGradient id="goldGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#047857" stop-opacity="0" />
    </radialGradient>
    <filter id="shadow2" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Circle background -->
  <circle cx="512" cy="512" r="512" fill="url(#bgGrad2)" />
  <circle cx="512" cy="512" r="490" fill="none" stroke="url(#goldGrad2)" stroke-width="8" stroke-opacity="0.4" />
  <circle cx="512" cy="460" r="320" fill="url(#glow2)" />

  <g filter="url(#shadow2)" transform="translate(512, 430)">
    <path d="M 50 -190 A 210 210 0 1 0 160 160 A 170 170 0 1 1 50 -190 Z" fill="url(#goldGrad2)" />
    <g transform="translate(75, -50) scale(0.65)">
      <polygon points="0,-75 22,-22 75,-22 33,12 50,65 0,33 -50,65 -33,12 -75,-22 -22,-22" fill="url(#goldGrad2)" />
    </g>
  </g>

  <g filter="url(#shadow2)">
    <text x="512" y="810" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="160" 
          font-weight="900" 
          letter-spacing="6"
          fill="#FFFFFF" 
          text-anchor="middle">NUR<tspan fill="url(#goldGrad2)">+</tspan></text>
  </g>
</svg>
`;

// Adaptive Foreground (Crescent + text on transparent canvas for Android adaptive icons)
const svgForeground = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldGradF" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
    <filter id="shadowF" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.5" />
    </filter>
  </defs>

  <g filter="url(#shadowF)" transform="translate(512, 430) scale(0.85)">
    <path d="M 50 -190 A 210 210 0 1 0 160 160 A 170 170 0 1 1 50 -190 Z" fill="url(#goldGradF)" />
    <g transform="translate(75, -50) scale(0.65)">
      <polygon points="0,-75 22,-22 75,-22 33,12 50,65 0,33 -50,65 -33,12 -75,-22 -22,-22" fill="url(#goldGradF)" />
    </g>
  </g>

  <g filter="url(#shadowF)" transform="scale(0.85) translate(90, 80)">
    <text x="512" y="810" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="160" 
          font-weight="900" 
          letter-spacing="6"
          fill="#FFFFFF" 
          text-anchor="middle">NUR<tspan fill="url(#goldGradF)">+</tspan></text>
  </g>
</svg>
`;

function createIco(pngBuffers) {
  const numImages = pngBuffers.length;
  let headerSize = 6 + (numImages * 16);
  let totalDataSize = pngBuffers.reduce((sum, b) => sum + b.length, 0);
  let out = Buffer.alloc(headerSize + totalDataSize);

  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(numImages, 4);

  let currentOffset = headerSize;
  pngBuffers.forEach((buf, i) => {
    const entryOffset = 6 + (i * 16);
    let dim = [16, 32, 48, 64, 128, 256][i];
    out.writeUInt8(dim === 256 ? 0 : dim, entryOffset);
    out.writeUInt8(dim === 256 ? 0 : dim, entryOffset + 1);
    out.writeUInt8(0, entryOffset + 2);
    out.writeUInt8(0, entryOffset + 3);
    out.writeUInt16LE(1, entryOffset + 4);
    out.writeUInt16LE(32, entryOffset + 6);
    out.writeUInt32LE(buf.length, entryOffset + 8);
    out.writeUInt32LE(currentOffset, entryOffset + 12);

    buf.copy(out, currentOffset);
    currentOffset += buf.length;
  });

  return out;
}

async function run() {
  const rootDir = path.resolve(__dirname, '..');
  const resDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  const publicDir = path.join(rootDir, 'public');
  const buildDir = path.join(rootDir, 'build');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const svgBuffer = Buffer.from(svgIcon);
  const svgRoundBuffer = Buffer.from(svgRoundIcon);
  const svgFgBuffer = Buffer.from(svgForeground);

  const densities = [
    { dir: 'mipmap-mdpi', size: 48 },
    { dir: 'mipmap-hdpi', size: 72 },
    { dir: 'mipmap-xhdpi', size: 96 },
    { dir: 'mipmap-xxhdpi', size: 144 },
    { dir: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const d of densities) {
    const targetFolder = path.join(resDir, d.dir);
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

    await sharp(svgBuffer)
      .resize(d.size, d.size)
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher.png'));

    await sharp(svgRoundBuffer)
      .resize(d.size, d.size)
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_round.png'));

    await sharp(svgFgBuffer)
      .resize(Math.round(d.size * 1.5), Math.round(d.size * 1.5))
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));

    console.log(`Generated ${d.dir} icons (${d.size}x${d.size})`);
  }

  const p512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon.png'), p512);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), p512);

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = [];
  for (const s of icoSizes) {
    const buf = await sharp(svgBuffer).resize(s, s).png().toBuffer();
    icoPngs.push(buf);
  }
  const icoData = createIco(icoPngs);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoData);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoPngs[0]);

  console.log('All custom Nur+ app icons and Windows .ico generated successfully!');
}

run().catch(console.error);
