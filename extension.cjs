const vscode = require('vscode');
const path = require('path');
const gen = require('./lib/generator.cjs');

const extensionId = 'lambogenius.hl7-schemagen';
const dotnetInstallToolId = 'ms-dotnettools.vscode-dotnet-runtime';
const lastSourceKey = 'hl7SchemaGen.lastSource';
const lastOutKey = 'hl7SchemaGen.lastOut';
const lastMessagesKey = 'hl7SchemaGen.lastMessages';

let output;

function log(line) {
  output.appendLine(line);
}

/** `dotnet` with a .NET 8+ runtime: the setting, then PATH, then the .NET Install Tool extension if it is installed. */
async function resolveDotnet() {
  const configured = vscode.workspace.getConfiguration('hl7SchemaGen').get('dotnetPath');
  if (configured) {
    if (await gen.hasDotnetRuntime(configured)) return configured;
    throw new Error(`hl7SchemaGen.dotnetPath (${configured}) has no .NET ${gen.MIN_DOTNET_MAJOR} or later runtime.`);
  }
  if (await gen.hasDotnetRuntime('dotnet')) return 'dotnet';

  if (vscode.extensions.getExtension(dotnetInstallToolId)) {
    const result = await vscode.commands.executeCommand('dotnet.acquire', { version: `${gen.MIN_DOTNET_MAJOR}.0`, requestingExtensionId: extensionId });
    if (result?.dotnetPath) return result.dotnetPath;
  }
  const choice = await vscode.window.showErrorMessage(
    `HL7 Schema Generator needs the .NET ${gen.MIN_DOTNET_MAJOR} runtime (or later).`,
    'Install .NET Install Tool', 'Download .NET');
  if (choice === 'Install .NET Install Tool') await vscode.commands.executeCommand('workbench.extensions.installExtension', dotnetInstallToolId);
  if (choice === 'Download .NET') await vscode.env.openExternal(vscode.Uri.parse(`https://dotnet.microsoft.com/download/dotnet/${gen.MIN_DOTNET_MAJOR}.0`));
  return undefined;
}

async function browseFolder(title) {
  const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title, openLabel: 'Select Folder' });
  return picked?.[0]?.fsPath;
}

async function pickSource(context) {
  const last = context.globalState.get(lastSourceKey);
  if (!last) return browseFolder('Folder with HL7 v2.xml schemas (segments.xsd and the message files)');
  const items = [
    { label: '$(folder) ' + path.basename(last), description: last, value: last },
    { label: '$(folder-opened) Browse...', value: undefined },
  ];
  const picked = await vscode.window.showQuickPick(items, { title: 'HL7 v2.xml schemas (download them from hl7.org with your HL7 account)', placeHolder: 'Folder with segments.xsd and the message files' });
  if (!picked) return undefined;
  return picked.value ?? browseFolder('Folder with HL7 v2.xml schemas (segments.xsd and the message files)');
}

async function listMessages(dotnet, dll, source, version) {
  const result = await gen.run(dotnet, [dll, ...gen.generatorArgs({ source, version, list: true })]);
  if (result.code !== 0 && gen.needsVersion(result.stderr) && !version) {
    const entered = await vscode.window.showInputBox({ title: 'HL7 version', prompt: 'The schema files do not name their HL7 version. Enter it:', placeHolder: '2.5.1', validateInput: v => /^2(\.\d+){1,2}$/.test(v.trim()) ? undefined : 'A version such as 2.5 or 2.5.1' });
    return entered ? listMessages(dotnet, dll, source, entered.trim()) : undefined;
  }
  if (result.code !== 0) throw new Error(result.stderr.trim() || `The generator exited with code ${result.code}.`);
  const list = gen.parseList(result.stdout);
  if (!list) throw new Error('Could not read the generator output:\n' + result.stdout);
  return { ...list, version: version || list.version, explicitVersion: version };
}

async function pickMessages(context, list) {
  const last = new Set(context.globalState.get(lastMessagesKey) || []);
  const all = { label: `$(check-all) All ${list.messages.length} message structures`, value: '*' };
  const items = [all, ...list.messages.map(m => ({ label: m, value: m, picked: last.has(m) }))];
  const picked = await vscode.window.showQuickPick(items, { canPickMany: true, title: `HL7 v${list.version}: message structures to generate`, placeHolder: 'Type to filter, e.g. ADT_A or ORU' });
  if (!picked || picked.length === 0) return undefined;
  if (picked.some(p => p.value === '*')) return [];
  const messages = picked.map(p => p.value);
  await context.globalState.update(lastMessagesKey, messages);
  return messages;
}

/** Logic App projects (folders with host.json) in the workspace, as their Artifacts/Schemas folders. */
async function logicAppSchemaFolders() {
  const hosts = await vscode.workspace.findFiles('**/host.json', '{**/node_modules/**,**/bin/**,**/obj/**,**/.git/**}', 20);
  return hosts.map(h => path.join(path.dirname(h.fsPath), 'Artifacts', 'Schemas'));
}

async function pickOutput(context) {
  const seen = new Set();
  const items = [];
  const add = (folder, label, detail) => {
    if (!folder || seen.has(folder.toLowerCase())) return;
    seen.add(folder.toLowerCase());
    items.push({ label, description: folder, detail, value: folder });
  };
  for (const folder of await logicAppSchemaFolders()) add(folder, '$(azure) ' + path.basename(path.dirname(path.dirname(folder))), 'Logic App schemas');
  add(context.workspaceState.get(lastOutKey), '$(history) Last used', undefined);
  items.push({ label: '$(folder-opened) Browse...', value: undefined });
  const picked = await vscode.window.showQuickPick(items, { title: 'Write the schemas to', placeHolder: 'They go to <folder>/<version>/' });
  if (!picked) return undefined;
  return picked.value ?? browseFolder('Output folder for the generated schemas');
}

async function generate(context, outUri) {
  output.show(true);
  const dotnet = await resolveDotnet();
  if (!dotnet) return;
  const dll = gen.generatorDll(context.extensionPath);

  const source = await pickSource(context);
  if (!source) return;
  const list = await listMessages(dotnet, dll, source);
  if (!list) return;
  await context.globalState.update(lastSourceKey, source);
  log(`HL7 v${list.version} v2.xml schemas in ${list.folder}: ${list.messages.length} message structures.`);

  const messages = await pickMessages(context, list);
  if (!messages) return;
  const out = outUri?.fsPath ?? await pickOutput(context);
  if (!out) return;
  await context.workspaceState.update(lastOutKey, out);

  const settings = vscode.workspace.getConfiguration('hl7SchemaGen');
  const args = gen.generatorArgs({
    source, out, messages,
    version: list.explicitVersion,
    namespace: settings.get('namespace'),
    versionedRoot: settings.get('versionedRoot'),
  });
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Generating HL7 v${list.version} schemas`, cancellable: true },
    (progress, token) => {
      const total = messages.length || list.messages.length;
      return gen.run(dotnet, [dll, ...args], {
        token,
        onLine(line) {
          log(line);
          if (/ -> .+\.xsd/.test(line)) progress.report({ increment: 100 / total, message: line.trim().split(' ')[0] });
        },
      });
    });

  if (result.code !== 0) {
    vscode.window.showErrorMessage(`Schema generation failed: ${result.stderr.trim() || 'exit code ' + result.code}`, 'Show Output').then(c => c && output.show());
    return;
  }
  const written = gen.parseWritten(result.stdout);
  const folder = path.join(out, list.version);
  const choice = await vscode.window.showInformationMessage(`Wrote ${written.length} HL7 v${list.version} schema(s) to ${folder}.`, 'Reveal in Explorer', 'Open First Schema');
  if (choice === 'Reveal in Explorer') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(written[0]?.path ?? folder));
  if (choice === 'Open First Schema' && written[0]) await vscode.window.showTextDocument(vscode.Uri.file(written[0].path));
}

function activate(context) {
  output = vscode.window.createOutputChannel('HL7 Schema Generator');
  const wrap = handler => async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      log(String(error?.stack || error));
      vscode.window.showErrorMessage(error?.message || String(error), 'Show Output').then(c => c && output.show());
    }
  };
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('hl7SchemaGen.generate', wrap(() => generate(context))),
    vscode.commands.registerCommand('hl7SchemaGen.generateHere', wrap(uri => generate(context, uri))),
  );
}

module.exports = { activate, deactivate() {} };
