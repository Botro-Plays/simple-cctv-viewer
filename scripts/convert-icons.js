const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '../resources/icons');

const conversions = [
  { input: 'icon.svg', outputPng: 'icon.png', outputIco: 'icon.ico', sizes: [256, 128, 64, 48, 32, 16] },
  { input: 'installer-icon.svg', outputPng: 'installer-icon.png', outputIco: 'installer-icon.ico', sizes: [256, 128, 64, 48, 32, 16] },
  { input: 'uninstaller-icon.svg', outputPng: 'uninstaller-icon.png', outputIco: 'uninstaller-icon.ico', sizes: [256, 128, 64, 48, 32, 16] },
  { input: 'portable-icon.svg', outputPng: 'portable-icon.png', outputIco: 'portable-icon.ico', sizes: [256, 128, 64, 48, 32, 16] },
  { input: 'tray-icon.svg', outputPng: 'tray-icon.png', outputIco: 'tray-icon.ico', sizes: [64, 48, 32, 16] },
];

async function createIco(pngPaths, icoPath) {
  const images = [];
  
  for (const pngPath of pngPaths) {
    const image = await sharp(pngPath).toBuffer();
    images.push(image);
  }
  
  // ICO file header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(images.length, 4); // Number of images
  
  let dataOffset = 6 + (16 * images.length);
  const imageData = [];
  
  for (const image of images) {
    const metadata = await sharp(image).metadata();
    const size = Math.min(metadata.width, 256);
    
    // Directory entry
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // Width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(image.length, 8); // Size of image data
    entry.writeUInt32LE(dataOffset, 12); // Offset to image data
    
    imageData.push(entry);
    imageData.push(image);
    dataOffset += image.length;
  }
  
  const icoBuffer = Buffer.concat([header, ...imageData]);
  fs.writeFileSync(icoPath, icoBuffer);
}

async function convertIcons() {
  for (const { input, outputPng, outputIco, sizes } of conversions) {
    const inputPath = path.join(iconsDir, input);
    const pngPath = path.join(iconsDir, outputPng);
    const icoPath = path.join(iconsDir, outputIco);
    
    try {
      // Convert to PNG first (largest size)
      await sharp(inputPath)
        .resize(sizes[0], sizes[0])
        .png()
        .toFile(pngPath);
      console.log(`Converted ${input} to ${outputPng} (${sizes[0]}x${sizes[0]})`);
      
      // Generate multiple sizes for ICO
      const pngPaths = [];
      for (const size of sizes) {
        const sizedPngPath = path.join(iconsDir, `temp_${size}_${outputPng}`);
        await sharp(inputPath)
          .resize(size, size)
          .png()
          .toFile(sizedPngPath);
        pngPaths.push(sizedPngPath);
      }
      
      // Create ICO from multiple PNG sizes
      await createIco(pngPaths, icoPath);
      console.log(`Converted ${outputPng} to ${outputIco}`);
      
      // Clean up temp files
      for (const sizedPngPath of pngPaths) {
        fs.unlinkSync(sizedPngPath);
      }
    } catch (error) {
      console.error(`Error converting ${input}:`, error.message);
    }
  }
}

convertIcons();
