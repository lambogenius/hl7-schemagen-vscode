const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('extension metadata is present', () => {
  assert.equal(pkg.name, 'hl7-schemagen');
  assert.equal(pkg.publisher, 'lambogenius');
  assert.equal(pkg.main, 'extension.cjs');
  const commands = pkg.contributes.commands.map(c => c.command);
  assert.deepEqual(commands, ['hl7SchemaGen.generate', 'hl7SchemaGen.generateHere']);
  for (const command of commands) assert.ok(pkg.activationEvents.includes(`onCommand:${command}`), `no activation event for ${command}`);
  assert.ok(pkg.contributes.menus['explorer/context'].some(m => m.command === 'hl7SchemaGen.generateHere'));
});

test('settings have defaults', () => {
  const props = pkg.contributes.configuration.properties;
  assert.equal(props['hl7SchemaGen.namespace'].default, 'http://lambogenius.com/HealthCare/HL7/2X');
  assert.equal(props['hl7SchemaGen.versionedRoot'].default, true);
  assert.equal(props['hl7SchemaGen.dotnetPath'].default, '');
});

test('build and packaging workflow is configured', () => {
  assert.equal(typeof pkg.scripts.build, 'string');
  assert.equal(typeof pkg.scripts.package, 'string');
  assert.equal(typeof pkg.scripts['package:vsix'], 'string');
  assert.equal(typeof pkg.scripts['reinstall:extension'], 'string');
  assert.ok(pkg.files.includes('bin/**'), 'the generator in bin/ must be packaged');
  assert.ok(!pkg.files.some(f => f.startsWith('generator')), 'sources and test fixtures stay out of the VSIX');
});

test('no HL7 v2.xml or BizTalk schema files are in the repository', () => {
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'bin', 'obj', 'artifacts'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.xsd$/i.test(entry.name)) {
        const head = fs.readFileSync(full, 'utf8').slice(0, 2000);
        if (/Sun Microsystems|Health Level Seven|Microsoft Corporation/i.test(head) || !/not HL7's files/.test(head)) offenders.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'only the self-written test fixtures may be .xsd files');
});
