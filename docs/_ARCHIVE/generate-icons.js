const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'icons');

// Read the source SVG
const svgPath = path.join(iconsDir, 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Create maskable SVG with safe zone padding
// Maskable icons need content within inner 80% (safe zone)
// We wrap the original content in a group that scales it down and add background padding
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Full background for maskable icon -->
  <rect width="512" height="512" fill="#0a1628"/>

  <!-- Scale down original content to 80% and center it (10% padding on each side) -->
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <!-- Original icon content without the background circle (which is now provided by rect above) -->

    <!-- Construction safety stripe pattern at top -->
    <defs>
      <pattern id="stripes" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(-45)">
        <rect width="10" height="20" fill="#f59e0b"/>
        <rect x="10" width="10" height="20" fill="#0a1628"/>
      </pattern>
    </defs>

    <!-- Navy circle background for the icon content -->
    <circle cx="256" cy="256" r="256" fill="#0a1628"/>

    <rect x="80" y="60" width="352" height="16" fill="url(#stripes)" rx="4"/>

    <!-- Microphone body - Orange -->
    <rect x="196" y="140" width="120" height="180" rx="60" fill="#ea580c"/>

    <!-- Microphone grille lines -->
    <line x1="220" y1="170" x2="292" y2="170" stroke="#0a1628" stroke-width="4" stroke-linecap="round"/>
    <line x1="220" y1="195" x2="292" y2="195" stroke="#0a1628" stroke-width="4" stroke-linecap="round"/>
    <line x1="220" y1="220" x2="292" y2="220" stroke="#0a1628" stroke-width="4" stroke-linecap="round"/>
    <line x1="220" y1="245" x2="292" y2="245" stroke="#0a1628" stroke-width="4" stroke-linecap="round"/>
    <line x1="220" y1="270" x2="292" y2="270" stroke="#0a1628" stroke-width="4" stroke-linecap="round"/>

    <!-- Microphone stand arc - Yellow -->
    <path d="M140 260 Q140 380 256 380 Q372 380 372 260" fill="none" stroke="#f59e0b" stroke-width="16" stroke-linecap="round"/>

    <!-- Microphone stand vertical - Yellow -->
    <line x1="256" y1="380" x2="256" y2="440" stroke="#f59e0b" stroke-width="16" stroke-linecap="round"/>

    <!-- Microphone base - Yellow -->
    <rect x="196" y="430" width="120" height="20" rx="10" fill="#f59e0b"/>

    <!-- Clipboard accent behind mic -->
    <rect x="160" y="100" width="192" height="240" rx="8" fill="none" stroke="#1e3a5f" stroke-width="6"/>
    <rect x="220" y="88" width="72" height="24" rx="4" fill="#1e3a5f"/>

    <!-- Small checkmark in corner - Safety green -->
    <circle cx="400" cy="400" r="50" fill="#16a34a"/>
    <path d="M375 400 L392 420 L430 375" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

async function generateIcons() {
  console.log('Generating PWA icons...\n');

  for (const size of sizes) {
    // Generate regular "any" purpose icon
    const anyIconPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toFile(anyIconPath);
    console.log(`✓ Generated: icon-${size}x${size}.png (any)`);

    // Generate maskable icon
    const maskableIconPath = path.join(iconsDir, `icon-${size}x${size}-maskable.png`);
    await sharp(Buffer.from(maskableSvg))
      .resize(size, size)
      .png()
      .toFile(maskableIconPath);
    console.log(`✓ Generated: icon-${size}x${size}-maskable.png (maskable)`);
  }

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
