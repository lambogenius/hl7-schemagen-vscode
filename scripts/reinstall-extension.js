const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const extensionId = packageJson.name;

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit', cwd: root });
}

try {
  run('npm run build');
  run('npx @vscode/vsce package --allow-missing-repository --out artifacts/hl7-schemagen.vsix');

  const codeExecutable = process.platform === 'win32' ? 'code.cmd' : 'code';
  const extensionPath = path.join(root, 'artifacts', 'hl7-schemagen.vsix');

  if (!fs.existsSync(extensionPath)) {
    throw new Error(`VSIX bundle not found at ${extensionPath}`);
  }

  try {
    run(`${codeExecutable} --install-extension ${extensionPath} --force`);
  } catch (error) {
    console.warn('VS Code CLI was not available on PATH. Falling back to a direct install hint.');
    console.log(`Install the extension manually with: ${codeExecutable} --install-extension ${extensionPath} --force`);
    console.log(`Extension identifier: ${extensionId}`);
  }
} catch (error) {
  console.error('Failed to rebuild and reinstall the extension.');
  console.error(error.message);
  process.exit(1);
}
