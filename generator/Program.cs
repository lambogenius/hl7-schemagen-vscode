using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lambogenius.Hl7SchemaGen;

// Usage: dotnet run --project generator -- <v2xml-folder> --out <folder> [MESSAGE ...] [--version 2.5.1]
//                                         [--namespace URI] [--plain-root] [--list]
// Reads HL7's v2.xml schemas (download them from hl7.org with your own HL7 account) and writes one XSD per message
// structure to <out>/<version>/<ROOT>.xsd: MSH and the body in one schema, named as the codec expects
// (PID_5_PatientName, XPN_0_FamilyName, ADT_A01_PROCEDURE). Without MESSAGE arguments every structure is written.
// --out can be a Logic App's Artifacts/Schemas folder.

var positional = new List<string>();
string outFolder = null, version = null, ns = null;
bool plainRoot = false, list = false;
for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--out": outFolder = Next(ref i); break;
        case "--version": version = Next(ref i); break;
        case "--namespace": ns = Next(ref i); break;
        case "--plain-root": plainRoot = true; break;
        case "--list": list = true; break;
        default:
            if (args[i].StartsWith("--")) return Usage($"Unknown option {args[i]}.");
            positional.Add(args[i]);
            break;
    }
}

if (positional.Count == 0) return Usage(null);
if (outFolder == null && !list) return Usage("--out is required.");

V2XmlSchemaConverter converter;
try
{
    converter = V2XmlSchemaConverter.Load(positional[0], version);
}
catch (Exception ex) when (ex is InvalidOperationException || ex is IOException || ex is System.Xml.XmlException || ex is System.Xml.Schema.XmlSchemaException)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}

Console.WriteLine($"HL7 v{converter.Version} v2.xml schemas in {converter.Folder}: {converter.MessageNames.Count} message structures.");
if (list)
{
    Console.WriteLine(string.Join(Environment.NewLine, converter.MessageNames));
    return 0;
}

var options = new V2XmlGenerateOptions { VersionedRoot = !plainRoot };
if (ns != null) options.Namespace = ns;

var messages = positional.Count > 1 ? positional.Skip(1).ToList() : converter.MessageNames.ToList();
var unknown = messages.Where(m => !converter.MessageNames.Contains(m)).ToList();
if (unknown.Count > 0)
{
    Console.Error.WriteLine($"Not in these schemas: {string.Join(", ", unknown)}. Use --list to see the structures.");
    return 1;
}

foreach (var message in messages)
{
    string path = converter.Write(message, outFolder, options);
    Console.WriteLine($"  {message} -> {path}" + (converter.DroppedWildcards > 0 ? $" ({converter.DroppedWildcards} xsd:any left out)" : string.Empty));
}
Console.WriteLine($"{messages.Count} schema(s) written.");
return 0;

string Next(ref int i) => i + 1 < args.Length ? args[++i] : null;

int Usage(string error)
{
    if (error != null) Console.Error.WriteLine(error);
    Console.Error.WriteLine("Usage: Hl7SchemaGen <v2xml-folder> --out <folder> [MESSAGE ...] [--version 2.5.1] [--namespace URI] [--plain-root] [--list]");
    return 2;
}
