# HL7 v2 Schema Generator

[![Source on GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/lambogenius/hl7-schemagen-vscode)

Generates one self-contained XSD per HL7 v2 message structure (`ADT_A01`, `ORU_R01`, ...) from HL7 International's
v2.xml schemas, written straight into an Azure Logic Apps project's `Artifacts/Schemas`.

## Features

- **HL7: Generate Schemas from v2.xml** in the Command Palette, or **HL7: Generate Schemas Here** on a folder in the
  Explorer.
- Pick any of the message structures in a filterable list, or all of them (202 for v2.5).
- Finds the Logic App projects in the workspace (folders with `host.json`) and offers their `Artifacts/Schemas`.
- Remembers the v2.xml folder and the last selection.
- Works locally and makes no network calls. Your HL7 files never leave your machine.

Each generated schema holds the whole message: `MSH` followed by the body, with groups included.

| | Example |
| --- | --- |
| File | `<output>/2.5/ADT_A01_25.xsd` |
| Root | `ADT_A01_25`, in namespace `http://lambogenius.com/HealthCare/HL7/2X`; children unqualified |
| Segments, groups | `PID`, `ADT_A01_PROCEDURE` |
| Fields (1-based) | `PID_5_PatientName` |
| Components (0-based) | `XPN_0_FamilyName` |
| Cardinality | Required fields, repeats, required segments and groups, taken from v2.xml |

The naming is the one the BizTalk HL7 2.X schemas use, and that the Lambogenius HL7 v2 codec for Azure Logic Apps
reads.

## Get the HL7 v2.xml schemas

The generator reads HL7's own v2.xml schemas: `datatypes.xsd`, `fields.xsd`, `segments.xsd` and one file per
message structure. HL7 International provides them free of charge to anyone with an HL7 account, under HL7's license
terms:

1. Create a free account at [hl7.org](https://www.hl7.org) and sign in.
2. Download the HL7 v2 standard for your version, which includes the v2.xml schemas, and unzip it.
3. Run **HL7: Generate Schemas from v2.xml** and point it to the folder with `segments.xsd`, or a folder above it.

The v2.xml schemas, and the schemas generated from them, contain HL7's content. Use them under your own HL7 license
and don't redistribute them. This extension and repository contain no HL7 schemas. The test fixtures in
`generator.tests/Fixtures` are self-written files for a made-up version 2.9.9.

## Requirements

- The .NET 8 runtime or later, which comes with any Azure Logic Apps Standard development setup. If `dotnet` isn't on
  your PATH, the extension uses Microsoft's **.NET Install Tool** extension when it's installed, or set
  `hl7SchemaGen.dotnetPath`.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `hl7SchemaGen.namespace` | `http://lambogenius.com/HealthCare/HL7/2X` | Target namespace of the message roots |
| `hl7SchemaGen.versionedRoot` | `true` | `ADT_A01_25` (several versions in one folder) or `ADT_A01` |
| `hl7SchemaGen.dotnetPath` | | `dotnet` to use when it isn't on PATH |

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

## Install locally

Source code: [GitHub repository](https://github.com/lambogenius/hl7-schemagen-vscode)

```powershell
npm run package:vsix
code --install-extension artifacts/hl7-schemagen.vsix --force
```

`npm run build` needs the .NET 8 SDK; it publishes the generator into `bin/`. Tests: `npm test` (extension and
bundled generator) and `npm run test:generator` (converter, xUnit). Set `HL7_V2XML_FOLDER` to also convert and compile
every structure of a real v2.xml download.

## How the conversion works

- v2.xml names (`PID.5`, `XPN.1`, `ADT_A01.PROCEDURE`) become `PID_5_PatientName`, `XPN_0_FamilyName` and
  `ADT_A01_PROCEDURE`. The descriptive part is the v2.xml `LongName` in PascalCase ("Driver's License Number -
  Patient" → `DriverSLicenseNumberPatient`).
- Primitive types and formatted text (FT, TX) are plain strings. `varies` (OBX-5) is a mixed wildcard type.
- The standard's "any segment" positions (`anyHL7Segment` / `anyZSegment`, used by some MFN, PC*, QBP and RTB
  structures) become an optional `xs:any namespace="##other"`. Adjacent ones are merged to keep the schema
  unambiguous.
- The `xs:any` extension points at the end of each v2.xml segment are left out.
- v2.xml has no table enumerations, so coded values aren't restricted.

HL7 and Health Level Seven are registered trademarks of Health Level Seven International. This project isn't
affiliated with or endorsed by HL7 International.
