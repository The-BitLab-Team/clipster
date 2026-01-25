const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

const copyDir = (fromDir, toDir) => {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const srcPath = path.join(fromDir, entry.name);
    const dstPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      copyFile(srcPath, dstPath);
    }
  }
};

// Copiar UI do renderer
copyDir(path.join(projectRoot, 'src', 'renderer'), path.join(distRoot, 'renderer'));

// Copiar configurações de personalidade
copyDir(path.join(projectRoot, 'config', 'personalities'), path.join(distRoot, 'config', 'personalities'));

console.log('Static assets copied.');
