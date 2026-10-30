// Candidate-external preparation only. .NET 2.0 APIs; no ZipArchive or external unzip. Target execution NOT_PERFORMED.
using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
public static class RehearsalZip {
  public static string Hash(string file) { using (FileStream f = File.OpenRead(file)) using (SHA256 h = SHA256.Create()) return BitConverter.ToString(h.ComputeHash(f)).Replace("-", "").ToLowerInvariant(); }
  static void Need(bool b, string code) { if (!b) throw new InvalidDataException(code); }
  static void Safe(string file) {
    for (string p = Path.GetFullPath(file); p != null; p = Path.GetDirectoryName(p))
      if (File.Exists(p) || Directory.Exists(p)) Need((File.GetAttributes(p) & FileAttributes.ReparsePoint) == 0, "REPARSE_POINT");
  }
  public static void Expand(string zipPath, string destination, string inventory, string expectedZipHash, string expectedTop, int expectedCount) {
    Safe(zipPath); Safe(destination); Safe(inventory);
    Need(expectedCount > 0 && expectedCount < 65535, "BOUND_ENTRY_COUNT");
    Need(!String.IsNullOrEmpty(expectedTop) && expectedTop.Length < 128 && expectedTop.IndexOfAny(new char[]{'/', '\\', ':'}) < 0 && expectedTop != "." && expectedTop != ".." && !expectedTop.EndsWith(".") && !expectedTop.EndsWith(" "), "BOUND_TOP");
    Need(Hash(zipPath) == expectedZipHash, "ZIP_HASH");
    Dictionary<string,string[]> expected = new Dictionary<string,string[]>(StringComparer.OrdinalIgnoreCase);
    foreach (string line in File.ReadAllLines(inventory, Encoding.UTF8)) {
      string[] v = line.Split('\t'); Need(v.Length == 3 && !expected.ContainsKey(v[2]), "INVENTORY"); expected.Add(v[2],v);
    }
    Need(expected.Count == expectedCount, "INVENTORY_COUNT");
    byte[] zip = File.ReadAllBytes(zipPath); Need(zip.Length >= 22, "ZIP_SHORT");
    int end = zip.Length - 22;
    while (end >= Math.Max(0,zip.Length-65557) && BitConverter.ToUInt32(zip,end) != 0x06054b50) end--;
    Need(end >= 0 && BitConverter.ToUInt32(zip,end) == 0x06054b50, "ZIP_END");
    Need(BitConverter.ToUInt16(zip,end+4) == 0 && BitConverter.ToUInt16(zip,end+6) == 0 && BitConverter.ToUInt16(zip,end+8) == expectedCount && BitConverter.ToUInt16(zip,end+10) == expectedCount, "ZIP_COUNT_DISK");
    int pos = checked((int)BitConverter.ToUInt32(zip,end+16));
    Dictionary<string,bool> names = new Dictionary<string,bool>(StringComparer.OrdinalIgnoreCase);
    string basePath = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
    for (int i=0;i<expectedCount;i++) {
      Need(pos >= 0 && pos+46 <= end && BitConverter.ToUInt32(zip,pos) == 0x02014b50,"ZIP_CENTRAL");
      int n = BitConverter.ToUInt16(zip,pos+28), extra=BitConverter.ToUInt16(zip,pos+30), comment=BitConverter.ToUInt16(zip,pos+32);
      Need(pos+46+n+extra+comment <= end,"ZIP_CENTRAL_BOUNDS");
      string name = new UTF8Encoding(false,true).GetString(zip,pos+46,n);
      Need(name.StartsWith(expectedTop + "/",StringComparison.Ordinal) && name.IndexOf('\\') < 0 && name.IndexOf(':') < 0 && !names.ContainsKey(name),"ZIP_SLIP_OR_DUPLICATE");
      names.Add(name,true);
      foreach(string part in name.Split('/')) Need(part.Length>0 && part!="." && part!=".." && !part.EndsWith(".") && !part.EndsWith(" "),"ZIP_SLIP");
      uint attr=BitConverter.ToUInt32(zip,pos+38); Need(((attr>>16)&0xF000)!=0xA000 && (attr&0x400)==0,"ZIP_LINK");
      Need(expected.ContainsKey(name),"ZIP_EXTRA_ENTRY");
      string[] fact=expected[name]; long size=long.Parse(fact[1],System.Globalization.CultureInfo.InvariantCulture);
      Need(size>=0 && size==BitConverter.ToUInt32(zip,pos+24),"ZIP_SIZE");
      int offset=checked((int)BitConverter.ToUInt32(zip,pos+42)), packed=checked((int)BitConverter.ToUInt32(zip,pos+20));
      Need(offset>=0 && offset+30<=zip.Length && BitConverter.ToUInt32(zip,offset)==0x04034b50,"ZIP_LOCAL");
      int localN=BitConverter.ToUInt16(zip,offset+26), localExtra=BitConverter.ToUInt16(zip,offset+28);
      int start=checked(offset+30+localN+localExtra); Need(start<=zip.Length && packed<=zip.Length-start,"ZIP_DATA_BOUNDS");
      Need(new UTF8Encoding(false,true).GetString(zip,offset+30,localN)==name,"ZIP_LOCAL_NAME");
      int method=BitConverter.ToUInt16(zip,pos+10); Need((method==0 || method==8) && (BitConverter.ToUInt16(zip,pos+8)&1)==0,"ZIP_METHOD");
      string file=Path.GetFullPath(Path.Combine(destination,name.Substring(expectedTop.Length + 1).Replace('/',Path.DirectorySeparatorChar)));
      Need(file.StartsWith(basePath,StringComparison.OrdinalIgnoreCase),"ZIP_SLIP"); Safe(file);
      Directory.CreateDirectory(Path.GetDirectoryName(file)); Safe(file);
      using(MemoryStream source=new MemoryStream(zip,start,packed)) {
        Stream input=source; if(method==8) input=new DeflateStream(source,CompressionMode.Decompress);
        using(input) using(FileStream output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
          byte[] buffer=new byte[65536]; long total=0; int got;
          while((got=input.Read(buffer,0,buffer.Length))>0) { total+=got; Need(total<=size,"ZIP_EXPANSION_LIMIT"); output.Write(buffer,0,got); }
          Need(total==size,"ZIP_EXPANSION_SIZE");
        }
      }
      Need(Hash(file)==fact[0],"ZIP_ENTRY_HASH");
      expected.Remove(name); pos+=46+n+extra+comment;
    }
    Need(expected.Count==0,"ZIP_MISSING_ENTRY");
    Need(pos == end && BitConverter.ToUInt32(zip,end+12) == (uint)(end - BitConverter.ToUInt32(zip,end+16)), "ZIP_CENTRAL_END");
  }
  static void Walk(string root, string dir, List<string> lines) {
    Safe(dir);
    foreach(string d in Directory.GetDirectories(dir)) Walk(root,d,lines);
    foreach(string f in Directory.GetFiles(dir)) { Safe(f); lines.Add(Hash(f)+"\t"+new FileInfo(f).Length+"\t"+f.Substring(root.Length).Replace('\\','/')); }
  }
  static void TreeCheck(System.Diagnostics.Stopwatch clock, int seconds) { Need(clock.Elapsed.TotalSeconds < seconds, "TREE_HASH_DEADLINE"); }
  static string TreeFileHash(string file, System.Diagnostics.Stopwatch clock, int seconds) {
    using (FileStream f=File.OpenRead(file)) using (SHA256 h=SHA256.Create()) {
      byte[] block=new byte[65536]; int got;
      while((got=f.Read(block,0,block.Length))>0) { TreeCheck(clock,seconds); h.TransformBlock(block,0,got,block,0); }
      h.TransformFinalBlock(new byte[0],0,0); TreeCheck(clock,seconds);
      return BitConverter.ToString(h.Hash).Replace("-", "").ToLowerInvariant();
    }
  }
  static void WalkBounded(string root,string dir,List<string> lines,System.Diagnostics.Stopwatch clock,int seconds) {
    TreeCheck(clock,seconds); Safe(dir);
    foreach(string d in Directory.GetDirectories(dir)) WalkBounded(root,d,lines,clock,seconds);
    foreach(string f in Directory.GetFiles(dir)) { TreeCheck(clock,seconds); Safe(f); Need(lines.Count<8192,"TREE_FILE_BOUND"); lines.Add(TreeFileHash(f,clock,seconds)+"\t"+new FileInfo(f).Length+"\t"+f.Substring(root.Length).Replace('\\','/')); }
  }
  public static string[] TreeBounded(string root,int seconds) {
    System.Diagnostics.Stopwatch clock=System.Diagnostics.Stopwatch.StartNew();
    root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
    List<string> lines=new List<string>(); WalkBounded(root,root,lines,clock,seconds); lines.Sort(StringComparer.Ordinal); TreeCheck(clock,seconds); return lines.ToArray();
  }
  public static string[] Tree(string root) {
    root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
    List<string> lines=new List<string>(); Walk(root,root,lines); lines.Sort(StringComparer.Ordinal); return lines.ToArray();
  }
}
