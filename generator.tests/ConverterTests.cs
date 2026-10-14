using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;
using Lambogenius.Hl7SchemaGen;
using Xunit;

namespace Lambogenius.Hl7SchemaGen.Tests
{
    /// <summary>
    /// HL7 v2.xml schemas → one XSD per message structure. Uses the v2.xml-style fixture in Fixtures/v2xml (a made-up
    /// test version 2.9.9, not HL7's files); set HL7_V2XML_FOLDER to also run it over a real v2.xml download.
    /// </summary>
    public class ConverterTests
    {
        private static readonly XNamespace Xs = "http://www.w3.org/2001/XMLSchema";
        private static readonly string Fixture = Path.Combine(AppContext.BaseDirectory, "Fixtures", "v2xml");

        private static V2XmlSchemaConverter Load() => V2XmlSchemaConverter.Load(Fixture);

        private static XElement Type(XDocument xsd, string name) =>
            xsd.Root.Elements().Single(e => (string)e.Attribute("name") == name);

        private static XmlSchemaSet Compile(XDocument xsd)
        {
            var errors = new List<string>();
            var set = new XmlSchemaSet();
            set.ValidationEventHandler += (_, e) => errors.Add(e.Message);
            set.Add(XmlSchema.Read(xsd.CreateReader(), (_, e) => errors.Add(e.Message)));
            set.Compile();
            Assert.True(errors.Count == 0, string.Join("\n", errors));
            return set;
        }

        private static List<string> Validate(XmlSchemaSet set, XDocument instance)
        {
            var errors = new List<string>();
            instance.Validate(set, (_, e) => errors.Add(e.Message));
            return errors;
        }

        [Fact]
        public void Finds_the_message_structures_and_the_version()
        {
            var converter = Load();
            Assert.Equal("2.9.9", converter.Version);
            Assert.Equal(new[] { "MFN_M99", "ORU_R01" }, converter.MessageNames);
            Assert.Equal("ORU_R01_299", converter.RootName("ORU_R01"));
            Assert.Equal("ORU_R01", converter.RootName("ORU_R01", new V2XmlGenerateOptions { VersionedRoot = false }));
        }

        [Fact]
        public void Writes_one_schema_with_MSH_and_the_body()
        {
            var xsd = Load().Generate("ORU_R01");
            Assert.Equal(V2XmlSchemaConverter.DefaultNamespace, (string)xsd.Root.Attribute("targetNamespace"));
            Assert.Equal("unqualified", (string)xsd.Root.Attribute("elementFormDefault"));

            var root = xsd.Root.Element(Xs + "element");
            Assert.Equal("ORU_R01_299", (string)root.Attribute("name"));
            var top = root.Element(Xs + "complexType").Element(Xs + "sequence").Elements().ToList();
            Assert.Equal("MSH", (string)top[0].Attribute("name"));
            Assert.Equal("ORU_R01_PATIENT_RESULT", (string)top[1].Attribute("name"));
            Assert.Equal("unbounded", (string)top[1].Attribute("maxOccurs"));

            // Fields 1-based with the v2.xml LongName, cardinality kept; components 0-based.
            var pid = Type(xsd, "PID_Segment").Descendants(Xs + "element").ToList();
            Assert.Equal(new[] { "PID_1_SetIDPID", "PID_3_PatientIdentifierList", "PID_5_PatientName", "PID_8_AdministrativeSex" },
                pid.Select(e => (string)e.Attribute("name")));
            Assert.Equal("XPN", (string)pid[2].Attribute("type"));
            Assert.Equal("1", (string)pid[2].Attribute("minOccurs"));
            Assert.Equal("unbounded", (string)pid[2].Attribute("maxOccurs"));
            Assert.Contains(Type(xsd, "MSH_Segment").Descendants(Xs + "element"), e => (string)e.Attribute("name") == "MSH_7_DateTimeOfMessage");

            var xpn = Type(xsd, "XPN").Descendants(Xs + "element").Select(e => ((string)e.Attribute("name"), (string)e.Attribute("type")));
            Assert.Equal(new[] { ("XPN_0_FamilyName", "FN"), ("XPN_1_GivenName", "ST") }, xpn);
            Assert.Equal(new[] { "FN_0_Surname", "FN_1_OwnSurnamePrefix" },
                Type(xsd, "FN").Descendants(Xs + "element").Select(e => (string)e.Attribute("name")));

            // FT (mixed with escape elements in v2.xml) is a plain string; varies is a mixed wildcard; the
            // segments' xsd:any ##other extension points are left out.
            Assert.Equal("simpleType", Type(xsd, "FT").Name.LocalName);
            Assert.Equal("true", (string)Type(xsd, "varies").Attribute("mixed"));
            Assert.DoesNotContain(xsd.Descendants(Xs + "any"), a => a.Ancestors(Xs + "complexType").Any(t => ((string)t.Attribute("name"))?.EndsWith("_Segment") == true));
            Assert.DoesNotContain(xsd.Descendants(), e => ((string)e.Attribute("name"))?.Contains('.') == true);
        }

        [Fact]
        public void Generated_schema_compiles_and_validates_a_message_with_nested_groups()
        {
            var set = Compile(Load().Generate("ORU_R01"));
            XNamespace ns = V2XmlSchemaConverter.DefaultNamespace;
            var message = new XDocument(new XElement(ns + "ORU_R01_299",
                new XElement("MSH",
                    new XElement("MSH_1_FieldSeparator", "|"),
                    new XElement("MSH_2_EncodingCharacters", "^~\\&"),
                    new XElement("MSH_7_DateTimeOfMessage", "20260101120000"),
                    new XElement("MSH_9_MessageType", new XElement("MSG_0_MessageCode", "ORU"), new XElement("MSG_1_TriggerEvent", "R01")),
                    new XElement("MSH_10_MessageControlID", "MSG1"),
                    new XElement("MSH_11_ProcessingID", "P"),
                    new XElement("MSH_12_VersionID", "2.9.9")),
                new XElement("ORU_R01_PATIENT_RESULT",
                    new XElement("ORU_R01_PATIENT",
                        new XElement("PID",
                            new XElement("PID_3_PatientIdentifierList", "12345"),
                            new XElement("PID_3_PatientIdentifierList", "67890"),
                            new XElement("PID_5_PatientName", new XElement("XPN_0_FamilyName", new XElement("FN_0_Surname", "DOE"))))),
                    new XElement("ORU_R01_ORDER_OBSERVATION",
                        new XElement("OBR",
                            new XElement("OBR_1_SetIDOBR", "1"),
                            new XElement("OBR_4_UniversalServiceIdentifier", new XElement("CWE_0_Identifier", "CBC")))))));

            var errors = Validate(set, message);
            Assert.True(errors.Count == 0, string.Join("\n", errors));

            // Required content is enforced: no PID-5.
            message.Descendants("PID_5_PatientName").Remove();
            Assert.NotEmpty(Validate(set, message));
        }

        [Fact]
        public void Any_segment_placeholders_become_one_optional_wildcard()
        {
            var xsd = Load().Generate("MFN_M99");
            var any = Assert.Single(xsd.Descendants(Xs + "any"), a => a.Parent.Parent.Parent?.Attribute("name")?.Value == "MFN_M99_MF");
            Assert.Equal("##other", (string)any.Attribute("namespace"));
            Assert.Equal("skip", (string)any.Attribute("processContents"));
            Assert.Equal("0", (string)any.Attribute("minOccurs"));
            Assert.Equal("2", (string)any.Attribute("maxOccurs")); // the two placeholders, merged
            Compile(xsd); // no Unique Particle Attribution error
        }

        [Fact]
        public void Write_puts_the_schema_under_the_version_folder()
        {
            string dir = Path.Combine(Path.GetTempPath(), "hl7-schemagen-" + Guid.NewGuid().ToString("N"));
            try
            {
                var converter = Load();
                string path = converter.Write("ORU_R01", dir);
                string plain = converter.Write("MFN_M99", dir, new V2XmlGenerateOptions { Namespace = "urn:custom", VersionedRoot = false });
                Assert.Equal(Path.Combine(dir, "2.9.9", "ORU_R01_299.xsd"), path);
                Assert.Equal(Path.Combine(dir, "2.9.9", "MFN_M99.xsd"), plain);

                var mfn = XDocument.Load(plain);
                Assert.Equal("urn:custom", (string)mfn.Root.Attribute("targetNamespace"));
                Assert.Equal("MFN_M99", (string)mfn.Root.Element(Xs + "element").Attribute("name"));
                Assert.Contains(mfn.Nodes().Concat(mfn.Root.Nodes()).OfType<XComment>(), c => c.Value.Contains("do not redistribute"));
            }
            finally
            {
                if (Directory.Exists(dir)) Directory.Delete(dir, true);
            }
        }

        [Theory]
        [InlineData("Driver's License Number - Patient", "DriverSLicenseNumberPatient")]
        [InlineData("Set ID - PID", "SetIDPID")]
        [InlineData("Date/Time of Message", "DateTimeOfMessage")]
        [InlineData("second and further given names or initials thereof", "SecondAndFurtherGivenNamesOrInitialsThereof")]
        [InlineData("2", "")] // an all-digit suffix would be read as a position
        [InlineData(null, "")]
        public void Long_names_become_PascalCase(string longName, string expected) =>
            Assert.Equal(expected, V2XmlSchemaConverter.PascalCase(longName));

        [Fact]
        public void Every_structure_of_a_real_v2xml_download_converts_and_compiles()
        {
            // Opt-in: HL7_V2XML_FOLDER = a folder with HL7's v2.xml schemas (licensed by HL7, never in this repository).
            string folder = Environment.GetEnvironmentVariable("HL7_V2XML_FOLDER");
            if (string.IsNullOrEmpty(folder)) return;

            var converter = V2XmlSchemaConverter.Load(folder);
            Assert.NotEmpty(converter.MessageNames);
            foreach (var message in converter.MessageNames) Compile(converter.Generate(message));
        }
    }
}
