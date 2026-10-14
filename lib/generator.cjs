// Runs the bundled generator (bin/Hl7SchemaGen.dll) with `dotnet`. No VS Code API here, so the tests can use it.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MIN_DOTNET_MAJOR = 8;

function generatorDll(extensionRoot) {
  return path.join(extensionRoot, 'bin', 'Hl7SchemaGen.dll');
}

function run(command, args, { onLine, token } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const lines = (chunk, sink) => {
      const text = chunk.toString();
      if (onLine) text.split(/\r?\n/).filter(Boolean).forEach(line => onLine(line, sink));
      return text;
    };
    child.stdout.on('data', chunk => { stdout += lines(chunk, 'stdout'); });
    child.stderr.on('data', chunk => { stderr += lines(chunk, 'stderr'); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    token?.onCancellationRequested?.(() => child.kill());
  });
}

/** True when `dotnet` at this path runs and has a .NET runtime the generator can use (8 or later). */
async function hasDotnetRuntime(dotnetPath) {
  try {
    const { code, stdout } = await run(dotnetPath, ['--list-runtimes']);
    return code === 0 && parseRuntimes(stdout).some(major => major >= MIN_DOTNET_MAJOR);
  } catch {
    return false;
  }
}

function parseRuntimes(listRuntimesOutput) {
  return [...listRuntimesOutput.matchAll(/^Microsoft\.NETCore\.App (\d+)\.\d+\.\S+/gm)].map(m => Number(m[1]));
}

/** Arguments for Hl7SchemaGen: `source --out out [MESSAGE ...] [--version v] [--namespace ns] [--plain-root]`, or `--list`. */
function generatorArgs({ source, out, messages = [], version, namespace, versionedRoot = true, list = false }) {
  const args = [source];
  if (list) args.push('--list');
  else args.push('--out', out, ...messages);
  if (version) args.push('--version', version);
  if (!list && namespace) args.push('--namespace', namespace);
  if (!list && !versionedRoot) args.push('--plain-root');
  return args;
}

/** Parses `--list` output: "HL7 v2.5 v2.xml schemas in <folder>: 202 message structures." then one name per line. */
function parseList(stdout) {
  const header = /^HL7 v(\S+) v2\.xml schemas in (.+): (\d+) message structures\.$/m.exec(stdout);
  if (!header) return null;
  const messages = stdout.slice(header.index + header[0].length).split(/\r?\n/).map(s => s.trim()).filter(s => /^[A-Za-z0-9_]+$/.test(s));
  return { version: header[1], folder: header[2], messages };
}

/** "  ADT_A01 -> C:\out\2.5\ADT_A01_25.xsd" lines of a generate run. */
function parseWritten(stdout) {
  return [...stdout.matchAll(/^\s+(\S+) -> (.+?\.xsd)(?: \(.*\))?$/gm)].map(m => ({ message: m[1], path: m[2] }));
}

/** The generator could not read the version from the files' headers and wants --version. */
function needsVersion(stderr) {
  return /Could not tell the HL7 version/.test(stderr);
}

module.exports = { MIN_DOTNET_MAJOR, generatorDll, run, hasDotnetRuntime, parseRuntimes, generatorArgs, parseList, parseWritten, needsVersion };
