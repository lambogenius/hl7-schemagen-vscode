# HL7 v2 Schema Generator

[![Source on GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/lambogenius/hl7-schemagen-vscode)

Generates one self-contained XSD per HL7 v2 message structure (`ADT_A01`, `ORU_R01`, ...) from HL7 International's
v2.xml schemas, written straight into an Azure Logic Apps project's `Artifacts/Schemas`.

## What it's for

HL7 v2 messages (`MSH|^~\&|...`) are text. To validate them, map them with XSLT, or pick fields with XPath in Azure
Logic Apps or another XML tool, you need an **XML schema for each message type**: one that describes the
segments, groups, fields and components of, say, an `ADT^A01` admission or an `ORU^R01` lab result.

Typical uses:

- **Migrating from BizTalk Server to Azure Logic Apps.** Get schemas in the BizTalk HL7 2.X naming
  (`PID_5_PatientName`, `XPN_0_FamilyName`), so existing maps and XPaths keep working, without copying BizTalk's
  schema files.
- **New Logic Apps healthcare integrations.** Get the schemas for exactly the messages you exchange (ADT, ORM, ORU,
  SIU, MDM, DFT, ...) in the HL7 version your partners send.
- **Validating or documenting interfaces.** Use one readable XSD per message structure, with the standard's
  required fields, repetitions and groups, in any XML editor or validator.

HL7 International publishes the definitions as "v2.xml" schemas, but they are spread over several shared files and
use names like `PID.5` and `XPN.1`. This extension turns them into one standalone schema per message in the
widely used BizTalk-style naming, in a few seconds, without leaving VS Code.

## Quick start

### 1. Get the HL7 v2.xml schemas (once per HL7 version)

The generator reads HL7's own v2.xml schemas: `datatypes.xsd`, `fields.xsd`, `segments.xsd` and one file per
message structure. HL7 International provides them free of charge to anyone with an HL7 account:

1. Create a free account at [hl7.org](https://www.hl7.org) and sign in.
2. Download the HL7 v2 standard package for your version (for example 2.5.1), which includes the v2.xml schemas.
3. Unzip it anywhere, for example `C:\hl7\v2.5.1`. You don't have to find the exact subfolder: the extension
   looks for `segments.xsd` itself.

### 2. Generate the schemas

1. Open your Logic App project, or any folder, in VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **HL7: Generate Schemas from v2.xml**.
   Or right-click a folder in the Explorer and choose **HL7: Generate Schemas Here** to write into that folder.
3. **Pick the v2.xml folder** from step 1. The extension remembers it for next time.
4. **Choose the message structures.** Type to filter (`ADT_A0`, `ORU`), tick the ones you need, and press
   `Enter`. Or tick **All message structures** to generate the whole version (about 200 files).
5. **Choose where to write them.** Logic App projects in your workspace are listed with their `Artifacts/Schemas`
   folder; or choose **Browse...**.
6. A notification shows the progress. When it finishes, choose **Reveal in Explorer** or **Open First Schema**.
   The **HL7 Schema Generator** output panel lists every file written.

The schemas go into a subfolder per HL7 version, for example `Artifacts/Schemas/2.5.1/ADT_A01_251.xsd`.

> **Message type vs. message structure.** HL7 reuses one structure for several trigger events. For example, `ADT^A04`
> and `ADT^A08` both use the `ADT_A01` structure, and `ADT^A03` uses `ADT_A03`. MSH-9.3 of a message names its
> structure; the HL7 standard's "message structure" tables list them all.

### 3. Use them

- **Azure Logic Apps (Standard):** the schemas in `Artifacts/Schemas` are deployed with your app and can be used by
  the XML actions (Validate XML, Transform XML maps, XPath) once the HL7 message is in XML. For example, decode it with
  an HL7 codec connector such as the Lambogenius HL7 v2 codec, which reads exactly this naming.
- **Anywhere else:** each file is a standard, self-contained XSD with no includes, so any XML tool can load it.

## What the generated schemas look like

Each schema holds the whole message: `MSH` followed by the body, groups included.

| | Example |
| --- | --- |
| File | `<output>/2.5/ADT_A01_25.xsd` |
| Root | `ADT_A01_25`, in namespace `http://lambogenius.com/HealthCare/HL7/2X`; children unqualified |
| Segments, groups | `PID`, `ADT_A01_PROCEDURE` |
| Fields (1-based) | `PID_5_PatientName` |
| Components (0-based) | `XPN_0_FamilyName` |
| Cardinality | Required fields, repeats, required segments and groups, taken from v2.xml |

A patient name in a message, as XML against the schema:

```xml
<ns0:ADT_A01_25 xmlns:ns0="http://lambogenius.com/HealthCare/HL7/2X">
  <MSH>...</MSH>
  <PID>
    <PID_5_PatientName>
      <XPN_0_FamilyName><FN_0_Surname>DOE</FN_0_Surname></XPN_0_FamilyName>
      <XPN_1_GivenName>JOHN</XPN_1_GivenName>
    </PID_5_PatientName>
  </PID>
</ns0:ADT_A01_25>
```

### How the conversion works

- v2.xml names (`PID.5`, `XPN.1`, `ADT_A01.PROCEDURE`) become `PID_5_PatientName`, `XPN_0_FamilyName` and
  `ADT_A01_PROCEDURE`. The descriptive part is the v2.xml `LongName` in PascalCase ("Driver's License Number -
  Patient" → `DriverSLicenseNumberPatient`).
- Primitive types and formatted text (FT, TX) are plain strings. `varies` (OBX-5) is a mixed wildcard type.
- The standard's "any segment" positions (`anyHL7Segment` / `anyZSegment`, used by some MFN, PC*, QBP and RTB
  structures) become an optional `xs:any namespace="##other"`. Adjacent ones are merged to keep the schema
  unambiguous.
- The `xs:any` extension points at the end of each v2.xml segment are left out.
- v2.xml has no table enumerations, so coded values aren't restricted.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `hl7SchemaGen.namespace` | `http://lambogenius.com/HealthCare/HL7/2X` | Target namespace of the message roots |
| `hl7SchemaGen.versionedRoot` | `true` | `ADT_A01_25`, so several versions can share a folder; or `ADT_A01` |
| `hl7SchemaGen.dotnetPath` | | `dotnet` to use when it isn't on PATH |

## Requirements

- VS Code 1.85 or later.
- The .NET 8 runtime or later, which comes with any Azure Logic Apps Standard development setup. If `dotnet` isn't on
  your PATH, the extension uses Microsoft's **.NET Install Tool** extension when it's installed, or set
  `hl7SchemaGen.dotnetPath`.
- HL7 v2.xml schemas from hl7.org (step 1 above).

## Troubleshooting

| Message | What to do |
| --- | --- |
| *needs the .NET 8 runtime* | Install .NET 8 or later from [dotnet.microsoft.com](https://dotnet.microsoft.com/download), or install the .NET Install Tool extension when prompted. |
| *does not contain HL7 v2.xml schemas (no segments.xsd)* | Pick the folder you unzipped the HL7 download into. It must contain `segments.xsd` somewhere below it. |
| *contains several v2.xml schema sets; pick one* | The folder holds more than one HL7 version. Pick the folder of one version. |
| A prompt asks for the HL7 version | The files don't name their version. Enter it, for example `2.5.1`. |
| *Not in these schemas: ...* | That structure doesn't exist in this HL7 version. Check the list, or use the structure from MSH-9.3. |

## Privacy and licensing

- The extension works entirely locally and makes no network calls. Your HL7 files and generated schemas never leave
  your machine.
- The v2.xml schemas, and the schemas generated from them, contain HL7's content. Use them under your own HL7
  license and don't redistribute them. This extension contains no HL7 schemas. The test fixtures in
  `generator.tests/Fixtures` are self-written files for a made-up version 2.9.9.
- The extension itself is MIT licensed.

## Without VS Code

The same generator runs from the command line:

```powershell
# PowerShell 7.2+, no build: compiles generator/V2XmlSchemaConverter.cs in memory
./generator/Hl7SchemaGen.ps1 -Source C:\hl7\v2.5 -Out C:\MyLogicApp\Artifacts\Schemas -Message ADT_A01, ORU_R01
./generator/Hl7SchemaGen.ps1 -Source C:\hl7\v2.5 -List

# .NET SDK
dotnet run --project generator -- C:\hl7\v2.5 --out C:\MyLogicApp\Artifacts\Schemas ADT_A01 ORU_R01
```

Options: `--version 2.5.1` when the files don't name their version, `--namespace URI`, `--plain-root`, `--list`.

## Build from source

Source code: [GitHub repository](https://github.com/lambogenius/hl7-schemagen-vscode)

```powershell
npm run package:vsix
code --install-extension artifacts/hl7-schemagen.vsix --force
```

`npm run build` needs the .NET 8 SDK; it publishes the generator into `bin/`. Tests: `npm test` (extension and
bundled generator) and `npm run test:generator` (converter, xUnit). Set `HL7_V2XML_FOLDER` to also convert and compile
every structure of a real v2.xml download.

---

HL7 and Health Level Seven are registered trademarks of Health Level Seven International. This project isn't
affiliated with or endorsed by HL7 International.
