const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const artifactsDir = path.join(root, 'artifacts');
const binDir = path.join(root, 'bin');

// The generator, framework-dependent (runs on the user's .NET 8+), into bin/ for the extension to run.
fs.rmSync(binDir, { recursive: true, force: true });
execFileSync('dotnet', ['publish', path.join(root, 'generator', 'Hl7SchemaGen.csproj'), '-c', 'Release', '-o', binDir,
  '--nologo', '-v', 'quiet', '-p:DebugType=none', '-p:UseAppHost=false'], { stdio: 'inherit' });

const requiredFiles = [
  'extension.cjs',
  'lib/generator.cjs',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'media/icon.png',
  'bin/Hl7SchemaGen.dll',
  'bin/Hl7SchemaGen.runtimeconfig.json',
];

fs.mkdirSync(artifactsDir, { recursive: true });

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required file is missing: ${relativePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageName = manifest.name || 'hl7-schemagen';
const packageVersion = manifest.version || '0.0.0';
const buildInfo = {
  generatedAt: new Date().toISOString(),
  packageName,
  packageVersion,
  files: requiredFiles,
};

fs.writeFileSync(path.join(artifactsDir, 'build-manifest.json'), JSON.stringify(buildInfo, null, 2));
console.log(`Build validated ${requiredFiles.length} extension files for ${packageName}@${packageVersion}.`);
