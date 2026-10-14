const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gen = require('../lib/generator.cjs');

const root = path.resolve(__dirname, '..');
const fixture = path.join(root, 'generator.tests', 'Fixtures', 'v2xml');
const dll = gen.generatorDll(root);
const built = fs.existsSync(dll) ? false : 'run `npm run build` first (bin/Hl7SchemaGen.dll)';

test('generator arguments', () => {
  assert.deepEqual(gen.generatorArgs({ source: 'S', list: true }), ['S', '--list']);
  assert.deepEqual(gen.generatorArgs({ source: 'S', list: true, version: '2.5.1' }), ['S', '--list', '--version', '2.5.1']);
  assert.deepEqual(gen.generatorArgs({ source: 'S', out: 'O', messages: ['ADT_A01', 'ORU_R01'], namespace: 'urn:x', versionedRoot: false }),
    ['S', '--out', 'O', 'ADT_A01', 'ORU_R01', '--namespace', 'urn:x', '--plain-root']);
  assert.deepEqual(gen.generatorArgs({ source: 'S', out: 'O' }), ['S', '--out', 'O']);
});

test('parses dotnet --list-runtimes', () => {
  const out = 'Microsoft.AspNetCore.App 8.0.32 [C:\\x]\nMicrosoft.NETCore.App 6.0.36 [C:\\x]\nMicrosoft.NETCore.App 10.0.11 [C:\\x]\n';
  assert.deepEqual(gen.parseRuntimes(out), [6, 10]);
});

test('parses list and generate output', () => {
  const list = gen.parseList('HL7 v2.5 v2.xml schemas in C:\\hl7\\2.5: 2 message structures.\nACK\nADT_A01\n');
  assert.deepEqual(list, { version: '2.5', folder: 'C:\\hl7\\2.5', messages: ['ACK', 'ADT_A01'] });
  assert.equal(gen.parseList('nonsense'), null);
  assert.deepEqual(gen.parseWritten('x\n  ADT_A01 -> C:\\o\\2.5\\ADT_A01_25.xsd\n  RTB_Knn -> /o/2.5/RTB_Knn_25.xsd (2 xsd:any left out)\n2 schema(s) written.'),
    [{ message: 'ADT_A01', path: 'C:\\o\\2.5\\ADT_A01_25.xsd' }, { message: 'RTB_Knn', path: '/o/2.5/RTB_Knn_25.xsd' }]);
  assert.ok(gen.needsVersion("Could not tell the HL7 version of 'x'; pass it with --version (e.g. 2.5.1)."));
});

test('bundled generator lists and writes the fixture schemas', { skip: built }, async () => {
  const listed = await gen.run('dotnet', [dll, ...gen.generatorArgs({ source: fixture, list: true })]);
  assert.equal(listed.code, 0, listed.stderr);
  const list = gen.parseList(listed.stdout);
  assert.equal(list.version, '2.9.9');
  assert.deepEqual(list.messages, ['MFN_M99', 'ORU_R01']);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7-schemagen-'));
  try {
    const lines = [];
    const result = await gen.run('dotnet', [dll, ...gen.generatorArgs({ source: fixture, out, messages: ['ORU_R01'], versionedRoot: false })], { onLine: l => lines.push(l) });
    assert.equal(result.code, 0, result.stderr);
    const written = gen.parseWritten(result.stdout);
    assert.deepEqual(written.map(w => w.message), ['ORU_R01']);
    assert.equal(written[0].path, path.join(out, '2.9.9', 'ORU_R01.xsd'));
    assert.match(fs.readFileSync(written[0].path, 'utf8'), /<xs:element name="ORU_R01">/);
    assert.ok(lines.some(l => l.includes('1 schema(s) written.')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('bundled generator reports an unknown message', { skip: built }, async () => {
  const result = await gen.run('dotnet', [dll, fixture, '--out', os.tmpdir(), 'NOPE_X']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Not in these schemas: NOPE_X/);
});
