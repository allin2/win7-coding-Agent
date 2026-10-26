// Apache-2.0. ENGINEERING_02 ADR-0196 local repair; target admission required. Never loaded by the product; no Win7 evidence.
// Passive: starts one own real-time ETW session, records Start/End of the dispatcher's descendants, never launches commands.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

public sealed class A31ManifestObserver
{
    public const string ApiProfile = "MANIFEST_PROCESS_GENERATIONS_V2_TEST_ONLY";
    const string Prefix = "A9-A31-R5-Manifest-";
    const string ConhostImage = "c:/windows/system32/conhost.exe";
    const string CmdImage = "c:/windows/system32/cmd.exe";
    const string PowerShellImage = "c:/windows/system32/windowspowershell/v1.0/powershell.exe";
    public const long FileTimeEpochTicks = 504911232000000000L;
    public const long ToleranceTicks = 160000L; // 16 ms, the R4 timestamp_precision_ms, in 100 ns units
    const int MaxEvents = 4096;
    const long MaxBytes = 8L * 1024 * 1024;
    const long HardBudgetMs = 750000;
    static readonly Guid Provider = new Guid("22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716");

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern uint StartTraceW(out ulong handle, string name, IntPtr props);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern uint ControlTraceW(ulong handle, string name, IntPtr props, uint code);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern ulong OpenTraceW(IntPtr logfile);
    [DllImport("advapi32.dll")] static extern uint ProcessTrace(ulong[] handles, uint count, IntPtr start, IntPtr end);
    [DllImport("advapi32.dll")] static extern uint CloseTrace(ulong handle);
    [DllImport("advapi32.dll")] static extern uint EnableTraceEx2(ulong handle, ref Guid provider, uint code, byte level, ulong any, ulong all, uint timeout, IntPtr parameters);
    [StructLayout(LayoutKind.Sequential)] struct Property { public ulong Name; public uint Index, Reserved; }
    [DllImport("tdh.dll")] static extern uint TdhGetPropertySize(IntPtr record, uint count, IntPtr context, uint propCount, ref Property property, out uint size);
    [DllImport("tdh.dll")] static extern uint TdhGetProperty(IntPtr record, uint count, IntPtr context, uint propCount, ref Property property, uint size, byte[] data);
    [DllImport("tdh.dll")] static extern uint TdhGetEventInformation(IntPtr record, uint count, IntPtr context, IntPtr info, ref uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint QueryDosDeviceW(string name, char[] target, uint max);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate void Callback(IntPtr record);

    public sealed class Rec
    {
        public int seq, id, version, pid, parent = -1, session = -1, exit_code = int.MinValue;
        public string image, event_ft, create_ft, exit_ft, schema;
    }

    public sealed class Open { public int pid; public string create_ft; }

    public sealed class Final
    {
        public int schema_version = 1;
        public string status = "NOT_PROVEN", runtime_profile = "WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE", source = "8d207ab11d2c8134a81e4e62900f395aae99944e";
        public string request_id, master_sha256, revision_sha256, machine = Environment.MachineName, session_name, c_device_mapping, stop_reason, error, callback_error, events_sha256, elapsed_ms;
        public int observer_pid, observer_session, dispatcher_pid, dispatcher_session, selected_count, counted_other, last_seq, self_test_cases;
        public string observer_creation_filetime, dispatcher_creation_filetime;
        public long events_file_bytes;
        public bool started, stopped, session_absent, consumer_ended;
        public uint enable_code = uint.MaxValue, stop_code = uint.MaxValue, close_code = uint.MaxValue, consume_code = uint.MaxValue;
        public uint events_lost = uint.MaxValue, log_buffers_lost = uint.MaxValue, realtime_buffers_lost = uint.MaxValue;
        public List<Open> open_instances = new List<Open>();
    }

    readonly object gate = new object();
    long dispatcherCreateFt;
    readonly List<Rec> recs = new List<Rec>();
    readonly string requestId;
    readonly int dispatcher;
    string callbackError, device;
    int counted, seq;
    long bytes;
    FileStream eventsFile;

    A31ManifestObserver(string request, int dispatcherPid)
    {
        requestId = request;
        dispatcher = dispatcherPid;

    }

    static void Require(bool b, string s) { if (!b) throw new InvalidOperationException(s); }
    static long Time(string s) { long n; Require(s != null && Regex.IsMatch(s,"^[1-9][0-9]{0,17}$") && long.TryParse(s, out n) && n > 0, "INVALID_FILETIME"); return long.Parse(s); }
    static string Sha(byte[] b) { using (SHA256 h = SHA256.Create()) { StringBuilder x = new StringBuilder(); foreach (byte v in h.ComputeHash(b)) x.Append(v.ToString("x2")); return x.ToString(); } }
    static byte[] Sub(byte[] b, int i, int n) { byte[] x = new byte[n]; Buffer.BlockCopy(b, i, x, 0, n); return x; }
    static string SessionName(string request) { Require(request != null && Regex.IsMatch(request, "^[a-f0-9]{32}$"), "REQUEST_ID"); return Prefix + request; }
    static Guid SessionGuid(string request) { using (SHA256 h = SHA256.Create()) { return new Guid(Sub(h.ComputeHash(Encoding.UTF8.GetBytes("A9-A31-R5|" + request)), 0, 16)); } }

    static string UnicodeAt(byte[] b, int offset)
    {
        Require(offset > 0 && (offset & 1) == 0 && offset < b.Length - 1, "SCHEMA_NAME_OFFSET");
        int end = offset;
        while (end + 1 < b.Length && (b[end] != 0 || b[end + 1] != 0)) end += 2;
        Require(end + 1 < b.Length && end - offset <= 256, "SCHEMA_NAME_BOUND");
        return Encoding.Unicode.GetString(b, offset, end - offset);
    }

    static void CheckType(Dictionary<string, int> x, string name, int type) { Require(x.ContainsKey(name) && x[name] == type, "SCHEMA_TYPE_" + name); }

    Dictionary<string, int> Schema(IntPtr rec, int id, int version)
    {
        uint size = 0;
        uint code = TdhGetEventInformation(rec, 0, IntPtr.Zero, IntPtr.Zero, ref size);
        Require(code == 122 && size >= 112 && size <= 65536, "SCHEMA_SIZE_" + code);
        IntPtr p = Marshal.AllocHGlobal((int)size);
        try
        {
            code = TdhGetEventInformation(rec, 0, IntPtr.Zero, p, ref size);
            Require(code == 0, "SCHEMA_READ_" + code);
            byte[] b = new byte[size];
            Marshal.Copy(p, b, 0, b.Length);
            Require(new Guid(Sub(b, 0, 16)) == Provider && BitConverter.ToUInt16(b, 32) == id && b[34] == version && BitConverter.ToInt32(b, 48) == 0, "SCHEMA_IDENTITY");
            int count = BitConverter.ToInt32(b, 100), top = BitConverter.ToInt32(b, 104);
            Require(count == top && count >= 5 && count <= 64 && 112 + 24 * count <= b.Length, "SCHEMA_PROPERTIES");
            Dictionary<string, int> types = new Dictionary<string, int>(StringComparer.Ordinal);
            for (int i = 0; i < count; i++)
            {
                int o = 112 + 24 * i;
                string n = UnicodeAt(b, BitConverter.ToInt32(b, o + 4));
                if (n != "ProcessID" && n != "CreateTime" && n != "ParentProcessID" && n != "SessionID" && n != "ImageName" && n != "ExitTime" && n != "ExitCode") continue;
                Require(BitConverter.ToInt32(b, o) == 0 && BitConverter.ToUInt16(b, o + 16) == 1 && !types.ContainsKey(n), "SCHEMA_FIELD_SHAPE");
                types.Add(n, BitConverter.ToUInt16(b, o + 8));
            }
            CheckType(types, "ProcessID", 8);
            CheckType(types, "CreateTime", 17);
            if (id == 1) { CheckType(types, "ParentProcessID", 8); CheckType(types, "SessionID", 8); }
            else { CheckType(types, "ExitTime", 17); CheckType(types, "ExitCode", 8); }
            Require(types.ContainsKey("ImageName") && (types["ImageName"] == 1 || types["ImageName"] == 2), "SCHEMA_IMAGE_TYPE");
            return types;
        }
        finally { Marshal.FreeHGlobal(p); }
    }

    byte[] Value(IntPtr rec, string name, int expected)
    {
        IntPtr np = Marshal.StringToHGlobalUni(name);
        try
        {
            Property p = new Property(); p.Name = (ulong)np.ToInt64(); p.Index = uint.MaxValue;
            uint size;
            uint c = TdhGetPropertySize(rec, 0, IntPtr.Zero, 1, ref p, out size);
            Require(c == 0 && size > 0 && size <= 4096 && (expected == 0 || size == expected), "VALUE_SIZE_" + name + "_" + c);
            byte[] b = new byte[size];
            c = TdhGetProperty(rec, 0, IntPtr.Zero, 1, ref p, size, b);
            Require(c == 0, "VALUE_READ_" + name + "_" + c);
            return b;
        }
        finally { Marshal.FreeHGlobal(np); }
    }

    static string DecodeImage(byte[] b, int type)
    {
        if (type == 1)
        {
            Require(b.Length >= 2 && (b.Length & 1) == 0 && b[b.Length - 1] == 0 && b[b.Length - 2] == 0, "IMAGE_ENCODING");
            string s = new UnicodeEncoding(false, false, true).GetString(b, 0, b.Length - 2);
            Require(s.IndexOf('\0') < 0, "IMAGE_EMBEDDED_NULL");
            return s;
        }
        Require(b.Length > 1 && b[b.Length - 1] == 0, "IMAGE_ENCODING");
        for (int i = 0; i < b.Length - 1; i++) Require(b[i] > 0 && b[i] < 128, "IMAGE_ANSI_NON_ASCII");
        return Encoding.ASCII.GetString(b, 0, b.Length - 1);
    }

    // Stored form: lower case, '/' separators, never a quote. A mapped device path becomes c:/...; an unmapped or basename-only value is kept as is.
    public static string NormalizeImage(string image, string mapping)
    {
        Require(image != null && image.Length > 0 && image.Length <= 520 && image.IndexOf('"') < 0, "IMAGE_VALUE");
        string x = image;
        if (!string.IsNullOrEmpty(mapping) && mapping.StartsWith(@"\Device\", StringComparison.Ordinal) && x.StartsWith(mapping + @"\", StringComparison.OrdinalIgnoreCase)) x = "C:" + x.Substring(mapping.Length);
        return x.Replace('\\', '/').ToLowerInvariant();
    }

    static string Line(Rec r)
    {
        return "{\"seq\":" + r.seq + ",\"id\":" + r.id + ",\"version\":" + r.version + ",\"pid\":" + r.pid + ",\"parent\":" + r.parent + ",\"session\":" + r.session +
            ",\"image\":\"" + r.image + "\",\"create_ft\":\"" + r.create_ft + "\",\"event_ft\":\"" + r.event_ft + "\",\"exit_ft\":" + (r.exit_ft == null ? "null" : "\"" + r.exit_ft + "\"") +
            ",\"exit_code\":" + (r.exit_code == int.MinValue ? "null" : r.exit_code.ToString()) + ",\"schema\":\"" + r.schema + "\"}\n";
    }

    void Receive(IntPtr rec)
    {
        try
        {
            Guid provider = (Guid)Marshal.PtrToStructure(IntPtr.Add(rec, 24), typeof(Guid));
            int id = (ushort)Marshal.ReadInt16(rec, 40), version = Marshal.ReadByte(rec, 42);
            if (provider != Provider || (id != 1 && id != 2)) { Interlocked.Increment(ref counted); return; }
            int len = (ushort)Marshal.ReadInt16(rec, 86);
            Require(len >= (id == 1 ? 20 : 24), "TRUNCATED_PROCESS_EVENT");
            int pid = BitConverter.ToInt32(Value(rec, "ProcessID", 4), 0);
            int parent = id == 1 ? BitConverter.ToInt32(Value(rec, "ParentProcessID", 4), 0) : -1;
            bool selected;
            lock (gate) { selected = id == 1 ? (parent == dispatcher || recs.Exists(x => x.id == 1 && (x.pid == parent || x.pid == pid))) : recs.Exists(x => x.id == 1 && x.pid == pid); }
            if (!selected) { Interlocked.Increment(ref counted); return; }
            Require(version <= 4, "UNSUPPORTED_TARGET_EVENT_VERSION");
            Dictionary<string, int> schema = Schema(rec, id, version);
            Rec e = new Rec();
            e.pid = pid; e.id = id; e.version = version;
            e.create_ft = BitConverter.ToInt64(Value(rec, "CreateTime", 8), 0).ToString();
            e.event_ft = Marshal.ReadInt64(rec, 16).ToString();
            e.image = NormalizeImage(DecodeImage(Value(rec, "ImageName", 0), schema["ImageName"]), device);
            List<string> names = new List<string>(schema.Keys);
            names.Sort(StringComparer.Ordinal);
            List<string> desc = new List<string>();
            foreach (string name in names) desc.Add(name + ":" + schema[name]);
            e.schema = string.Join(",", desc.ToArray());
            if (id == 1)
            {
                e.parent = parent;
                e.session = BitConverter.ToInt32(Value(rec, "SessionID", 4), 0);
            }
            else
            {
                e.exit_ft = BitConverter.ToInt64(Value(rec, "ExitTime", 8), 0).ToString();
                e.exit_code = BitConverter.ToInt32(Value(rec, "ExitCode", 4), 0);
            }
            lock (gate)
            {
                Require(recs.Count < MaxEvents, "EVENT_COUNT_LIMIT");
                ValidateInstanceEvent(recs, e, dispatcher, dispatcherCreateFt);
                e.seq = ++seq;
                string line = Line(e);
                byte[] raw = new UTF8Encoding(false).GetBytes(line);
                Require(raw.Length <= 1024 && bytes + raw.Length <= MaxBytes, "EVENT_BYTES_LIMIT");
                eventsFile.Write(raw, 0, raw.Length);
                eventsFile.Flush();
                bytes += raw.Length;
                recs.Add(e);
            }
        }
        catch (Exception ex) { lock (gate) { if (callbackError == null) callbackError = ex.GetType().Name + ":" + ex.Message; } }
    }

    static IntPtr Props(string request)
    {
        string name = SessionName(request);
        IntPtr p = Marshal.AllocHGlobal(2168);
        byte[] b = new byte[2168];
        BitConverter.GetBytes(b.Length).CopyTo(b, 0);
        SessionGuid(request).ToByteArray().CopyTo(b, 24);
        BitConverter.GetBytes(1).CopyTo(b, 40);
        BitConverter.GetBytes(0x20000).CopyTo(b, 44);
        BitConverter.GetBytes(64).CopyTo(b, 48);
        BitConverter.GetBytes(4).CopyTo(b, 52);
        BitConverter.GetBytes(16).CopyTo(b, 56);
        BitConverter.GetBytes(0x100).CopyTo(b, 64);
        BitConverter.GetBytes(1).CopyTo(b, 68);
        BitConverter.GetBytes(120).CopyTo(b, 116);
        Encoding.Unicode.GetBytes(name + "\0").CopyTo(b, 120);
        Marshal.Copy(b, 0, p, b.Length);
        return p;
    }

    public static uint QueryOwnSession(string request)
    {
        IntPtr p = Props(request);
        try { return ControlTraceW(0, SessionName(request), p, 0); }
        finally { Marshal.FreeHGlobal(p); }
    }

    // Failure path only: stops the exact own session by name. Never ends any process.
    public static uint StopNamedSession(string request)
    {
        IntPtr p = Props(request);
        try { return ControlTraceW(0, SessionName(request), p, 1); }
        finally { Marshal.FreeHGlobal(p); }
    }

    public static string StopText(string request, int observerPid, string observerCreationFileTime, string master, string revision)
    {
        Require(Regex.IsMatch(request, "^[a-f0-9]{32}$") && Regex.IsMatch(master, "^[a-f0-9]{64}$") && Regex.IsMatch(revision, "^[a-f0-9]{64}$") && Regex.IsMatch(observerCreationFileTime, "^[0-9]{1,20}$") && observerPid > 0, "STOP_TEXT_ARGS");
        return "{\"schema_version\":1,\"request_id\":\"" + request + "\",\"observer_pid\":" + observerPid + ",\"observer_creation_filetime\":\"" + observerCreationFileTime + "\",\"master_sha256\":\"" + master + "\",\"revision_sha256\":\"" + revision + "\",\"stop_reason\":\"AGENT_PHASE_TERMINAL_VERIFIED\"}\n";
    }

    static void SaveNew(string path, string text)
    {
        using (FileStream s = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
        {
            byte[] b = new UTF8Encoding(false).GetBytes(text);
            s.Write(b, 0, b.Length);
            s.Flush();
        }
    }

    public static Final Run(string request, int dispatcherPid, string dispatcherCreation, string dir, string master, string revision, int dispatcherSession)
    {
        Final r = new Final();
        r.request_id = request; r.master_sha256 = master; r.revision_sha256 = revision; r.dispatcher_pid = dispatcherPid; r.dispatcher_creation_filetime = dispatcherCreation; r.dispatcher_session = dispatcherSession;
        Stopwatch clock = Stopwatch.StartNew();
        A31ManifestObserver self = new A31ManifestObserver(request, dispatcherPid);
        IntPtr props = IntPtr.Zero, log = IntPtr.Zero, logName = IntPtr.Zero;
        ulong sessionHandle = 0, consumer = ulong.MaxValue;
        Thread thread = null;
        Callback callback = self.Receive;
        uint consumeCode = uint.MaxValue;
        string stopPath = Path.Combine(dir, "stop-" + request + ".json");
        try
        {
            Require(IntPtr.Size == 8, "X64_REQUIRED");
            r.session_name = SessionName(request);
            Require(Regex.IsMatch(master, "^[a-f0-9]{64}$") && Regex.IsMatch(revision, "^[a-f0-9]{64}$") && Regex.IsMatch(dispatcherCreation, "^[0-9]{1,20}$"), "ARGUMENTS");
            using (Process me = Process.GetCurrentProcess())
            {
                r.observer_pid = me.Id; r.observer_session = me.SessionId;
                r.observer_creation_filetime = me.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();
            }
            using (Process d = Process.GetProcessById(dispatcherPid))
            {
                Require(d.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() == dispatcherCreation && d.SessionId == dispatcherSession, "DISPATCHER_IDENTITY");
            }
            self.dispatcherCreateFt = Time(dispatcherCreation);
            r.self_test_cases = SelfTest();
            char[] map = new char[32768];
            uint n = QueryDosDeviceW("C:", map, (uint)map.Length);
            Require(n > 1 && n <= map.Length, "QUERY_DEVICE_" + Marshal.GetLastWin32Error());
            string[] mappings = new string(map, 0, (int)n).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
            Require(mappings.Length == 1, "DEVICE_MAPPING_NOT_UNIQUE");
            self.device = mappings[0]; r.c_device_mapping = self.device;
            Require(QueryOwnSession(request) == 4201, "SESSION_NOT_FRESH");
            self.eventsFile = new FileStream(Path.Combine(dir, "observer-events.jsonl"), FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            props = Props(request);
            uint st = StartTraceW(out sessionHandle, r.session_name, props);
            Require(st == 0, "START_TRACE_" + st);
            r.started = true;
            log = Marshal.AllocHGlobal(448);
            Marshal.Copy(new byte[448], 0, log, 448);
            logName = Marshal.StringToHGlobalUni(r.session_name);
            Marshal.WriteIntPtr(log, 8, logName);
            Marshal.WriteInt32(log, 28, 0x10000100);
            Marshal.WriteIntPtr(log, 424, Marshal.GetFunctionPointerForDelegate(callback));
            consumer = OpenTraceW(log);
            Require(consumer != ulong.MaxValue, "OPEN_TRACE_FAILED");
            thread = new Thread(() => { consumeCode = ProcessTrace(new ulong[] { consumer }, 1, IntPtr.Zero, IntPtr.Zero); });
            thread.IsBackground = true;
            thread.Start();
            Guid provider = Provider;
            r.enable_code = EnableTraceEx2(sessionHandle, ref provider, 1, 5, 0x10, 0, 5000, IntPtr.Zero);
            Require(r.enable_code == 0, "ENABLE_PROVIDER_" + r.enable_code);
            SaveNew(Path.Combine(dir, "observer-ready.json"), Json(new Ready(r)) + "\n");
            string expectedStop = StopText(request, r.observer_pid, r.observer_creation_filetime, master, revision);
            long invalidSince = -1, lastBeat = -1000;
            string beatPath = Path.Combine(dir, "observer-heartbeat.json");
            while (true)
            {
                if (clock.ElapsedMilliseconds - lastBeat >= 500)
                {
                    // Liveness signal for the ordinary-account controller, which cannot open this elevated process: only the file mtime is read.
                    using (FileStream beat = new FileStream(beatPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                    {
                        byte[] bb = new UTF8Encoding(false).GetBytes("{\"observer_pid\":" + r.observer_pid + ",\"elapsed_ms\":" + clock.ElapsedMilliseconds + "}\n");
                        beat.Write(bb, 0, bb.Length);
                        beat.Flush();
                    }
                    lastBeat = clock.ElapsedMilliseconds;
                }
                lock (self.gate) { if (self.callbackError != null) { r.stop_reason = "CALLBACK_ERROR"; break; } }
                if (File.Exists(stopPath))
                {
                    string text = null;
                    try { text = File.ReadAllText(stopPath, new UTF8Encoding(false)); } catch (IOException) { }
                    if (text == expectedStop) { r.stop_reason = "AGENT_PHASE_TERMINAL_VERIFIED"; break; }
                    // The agent creates then writes the file; tolerate a partial read for 2 s before declaring the signal invalid.
                    if (invalidSince < 0) invalidSince = clock.ElapsedMilliseconds;
                    if (clock.ElapsedMilliseconds - invalidSince > 2000) { r.stop_reason = "STOP_SIGNAL_INVALID"; r.error = "STOP_SIGNAL_INVALID"; break; }
                }
                if (clock.ElapsedMilliseconds > HardBudgetMs) { r.stop_reason = "HARD_BUDGET_EXCEEDED"; r.error = "HARD_BUDGET_EXCEEDED"; break; }
                Thread.Sleep(50);
            }
        }
        catch (Exception ex) { r.error = ex.GetType().Name + ":" + ex.Message; }
        finally
        {
            if (r.started)
            {
                if (r.stop_reason == "CALLBACK_ERROR" || r.error != null) { try { SaveNew(Path.Combine(dir, "observer-halted.json"), "{\"status\":\"HALTED\",\"reason\":\"" + (r.stop_reason == null ? "ERROR" : r.stop_reason) + "\"}\n"); } catch (Exception) { } }
                r.stop_code = ControlTraceW(sessionHandle, null, props, 1);
                r.stopped = r.stop_code == 0;
                if (r.stopped)
                {
                    r.events_lost = (uint)Marshal.ReadInt32(props, 88);
                    r.log_buffers_lost = (uint)Marshal.ReadInt32(props, 96);
                    r.realtime_buffers_lost = (uint)Marshal.ReadInt32(props, 100);
                }
                r.session_absent = QueryOwnSession(request) == 4201;
            }
            if (thread != null) { r.consumer_ended = thread.Join(5000); r.consume_code = consumeCode; }
            if (consumer != ulong.MaxValue)
            {
                r.close_code = CloseTrace(consumer);
                if (thread != null && !r.consumer_ended) r.consumer_ended = thread.Join(2000);
            }
            GC.KeepAlive(callback);
            if (thread == null || r.consumer_ended)
            {
                if (log != IntPtr.Zero) Marshal.FreeHGlobal(log);
                if (logName != IntPtr.Zero) Marshal.FreeHGlobal(logName);
            }
            if (props != IntPtr.Zero) Marshal.FreeHGlobal(props);
            lock (self.gate)
            {
                r.callback_error = self.callbackError;
                r.selected_count = self.recs.Count; r.last_seq = self.seq; r.events_file_bytes = self.bytes; r.counted_other = self.counted;
                foreach (Rec s in self.recs)
                {
                    if (s.id != 1) continue;
                    if (self.recs.FindAll(x => x.pid == s.pid && x.create_ft == s.create_ft && x.id == 2).Count == 0) { Open o = new Open(); o.pid = s.pid; o.create_ft = s.create_ft; r.open_instances.Add(o); }
                }
            }
            if (self.eventsFile != null) { try { self.eventsFile.Dispose(); } catch (Exception ex) { r.error = "EVENT_FILE_CLOSE:" + ex.GetType().Name; } }
            try { string eventPath=Path.Combine(dir,"observer-events.jsonl");Require(new FileInfo(eventPath).Length==r.events_file_bytes && r.events_file_bytes<=MaxBytes,"EVENT_FILE_FINAL_SIZE");r.events_sha256 = Sha(File.ReadAllBytes(eventPath)); } catch (Exception ex) { r.error = "EVENT_FILE_FINAL_AUDIT:" + ex.GetType().Name; }
            r.elapsed_ms = clock.ElapsedMilliseconds.ToString();
        }
        bool clean = r.error == null && r.events_sha256 != null && r.callback_error == null && r.stop_reason == "AGENT_PHASE_TERMINAL_VERIFIED" && r.started && r.enable_code == 0 && r.stopped && r.session_absent && r.consumer_ended && r.consume_code == 0 && r.close_code == 0 && r.events_lost == 0 && r.log_buffers_lost == 0 && r.realtime_buffers_lost == 0;
        if (clean) r.status = "OBSERVER_FINAL_CLOSED";
        return r;
    }

    public sealed class Ready
    {
        public int schema_version = 1;
        public string status = "OBSERVER_READY", runtime_profile, source, request_id, master_sha256, revision_sha256, session_name, observer_creation_filetime, dispatcher_creation_filetime, machine, c_device_mapping;
        public int observer_pid, observer_session, dispatcher_pid, dispatcher_session, self_test_cases;
        public uint enable_code;
        public Ready(Final f)
        {
            runtime_profile = f.runtime_profile; source = f.source; request_id = f.request_id; master_sha256 = f.master_sha256; revision_sha256 = f.revision_sha256;
            session_name = f.session_name; observer_creation_filetime = f.observer_creation_filetime; dispatcher_creation_filetime = f.dispatcher_creation_filetime; machine = f.machine; c_device_mapping = f.c_device_mapping;
            observer_pid = f.observer_pid; observer_session = f.observer_session; dispatcher_pid = f.dispatcher_pid; dispatcher_session = f.dispatcher_session; self_test_cases = f.self_test_cases; enable_code = f.enable_code;
        }
    }

    // ---- Pure proof logic (replayable, no native calls) ----
    static readonly Regex Field = new Regex("\"([a-z_]+)\":(?:\"([^\"]*)\"|(-?[0-9]+)|(null))", RegexOptions.CultureInvariant);

    public static List<Rec> Parse(string text)
    {
        List<Rec> list = new List<Rec>();
        int end = text.LastIndexOf('\n');
        if (end < 0) return list;
        foreach (string line in text.Substring(0, end).Split('\n'))
        {
            Require(line.Length > 0 && line.Length <= 1024, "RECORD_LINE");
            Dictionary<string, string> d = new Dictionary<string, string>();
            foreach (Match m in Field.Matches(line))
            {
                string k = m.Groups[1].Value;
                Require(!d.ContainsKey(k), "RECORD_DUP_KEY");
                d[k] = m.Groups[4].Success ? null : (m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value);
            }
            Require(d.Count == 12, "RECORD_FIELDS");
            Rec e = new Rec();
            e.seq = int.Parse(d["seq"]); e.id = int.Parse(d["id"]); e.version = int.Parse(d["version"]); e.pid = int.Parse(d["pid"]); e.parent = int.Parse(d["parent"]); e.session = int.Parse(d["session"]);
            e.image = d["image"]; e.create_ft = d["create_ft"]; e.event_ft = d["event_ft"]; e.exit_ft = d["exit_ft"]; e.schema = d["schema"];
            e.exit_code = d["exit_code"] == null ? int.MinValue : int.Parse(d["exit_code"]);
            Require(e.seq == list.Count + 1 && (e.id == 1 || e.id == 2), "RECORD_SEQUENCE");
            list.Add(e);
        }
        return list;
    }

    static bool ValidSchema(string s, int id)
    {
        string start = "CreateTime:17,ImageName:1,ParentProcessID:8,ProcessID:8,SessionID:8", end = "CreateTime:17,ExitCode:8,ExitTime:17,ImageName:2,ProcessID:8";
        return id == 1 ? s == start : (s == end || s == end.Replace("ImageName:2", "ImageName:1"));
    }

    static string Base(string image) { int i = image.LastIndexOf('/'); return i < 0 ? image : image.Substring(i + 1); }

    // Shared by the real callback and target-runtime SelfTest. Never match an End by PID alone.
    public static string InstanceKey(Rec e) { return e.pid.ToString() + ":" + Time(e.create_ft).ToString(); }
    static List<Rec> ParentGenerations(List<Rec> all, int pid, long childCreate)
    {
        return all.FindAll(p => p.id == 1 && p.pid == pid && Time(p.create_ft) <= childCreate &&
            !all.Exists(x => x.id == 2 && InstanceKey(x) == InstanceKey(p) && Time(x.exit_ft) < childCreate));
    }
    public static void ValidateInstanceEvent(List<Rec> all, Rec e, int rootPid, long rootCreate)
    {
        Require(e.pid > 0 && (e.id == 1 || e.id == 2) && ValidSchema(e.schema,e.id) && e.version >= 0 && e.version <= 4, "INSTANCE_FIELDS");
        string key = InstanceKey(e); long creation = Time(e.create_ft), eventTime = Time(e.event_ft);
        Require(eventTime >= creation, "INSTANCE_EVENT_CLOCK");
        List<Rec> same = all.FindAll(x => InstanceKey(x) == key);
        if(e.id == 1)
        {
            Require(!same.Exists(x => x.id == 1), "DUPLICATE_START_INSTANCE");
            foreach(Rec prior in all.FindAll(x => x.id == 1 && x.pid == e.pid))
            {
                List<Rec> ended = all.FindAll(x => x.id == 2 && InstanceKey(x) == InstanceKey(prior));
                Require(ended.Count == 1 && Time(ended[0].exit_ft) <= creation && Time(prior.create_ft) < creation, "INSTANCE_REUSE_NOT_PROVEN");
            }
            List<Rec> parents = ParentGenerations(all,e.parent,creation);
            int roots = e.parent == rootPid && creation >= rootCreate ? 1 : 0;
            Require(parents.Count + roots == 1, "INSTANCE_PARENT_GENERATION_UNKNOWN_OR_AMBIGUOUS");
            if(parents.Count == 1) Require(parents[0].session == e.session, "INSTANCE_PARENT_SESSION");
        }
        else
        {
            Require(same.FindAll(x => x.id == 1).Count == 1, "INSTANCE_END_WITHOUT_MATCHING_START");
            Require(!same.Exists(x => x.id == 2), "DUPLICATE_END_INSTANCE");
            Require(Time(e.exit_ft) >= creation && eventTime >= Time(e.exit_ft), "INSTANCE_END_CLOCK");
        }
    }

    static void ValidateProofLedger(List<Rec> all)
    {
        Dictionary<string,Rec> begins=new Dictionary<string,Rec>(), ends=new Dictionary<string,Rec>();Dictionary<int,Rec> latest=new Dictionary<int,Rec>();
        foreach(Rec e in all)
        {
            string key=InstanceKey(e);long born=Time(e.create_ft);
            Require(e.seq>0 && Time(e.event_ft)>=born,"PROOF_EVENT_CLOCK");
            if(e.id==1){Require(!begins.ContainsKey(key),"PROOF_DUPLICATE_INSTANCE");
                Rec prior;if(latest.TryGetValue(e.pid,out prior))Require(ends.ContainsKey(InstanceKey(prior)) && Time(ends[InstanceKey(prior)].exit_ft)<=born && Time(prior.create_ft)<born,"PROOF_REUSE_NOT_PROVEN");begins.Add(key,e);latest[e.pid]=e;}
            else{Require(begins.ContainsKey(key) && !ends.ContainsKey(key),"PROOF_END_INSTANCE_UNKNOWN_OR_DUPLICATE");Require(Time(e.exit_ft)>=born && Time(e.event_ft)>=Time(e.exit_ft) && begins[key].seq<e.seq,"PROOF_END_CLOCK");ends.Add(key,e);}
        }
    }

    // Returns null while the Start/End pair has not fully arrived yet; throws on any contradiction.
    public static string ProofFromRecords(List<Rec> all, int pid, int parentPid, long parentCreateFt, string parentKind, int parentSession, int expectedSession, long snapStartFt, long snapCapFt)
    {
        Require(pid > 0 && parentPid > 0 && parentCreateFt > 0 && snapStartFt > 0 && snapCapFt >= snapStartFt, "PROOF_ARGUMENTS");
        Require(parentKind == "cmd" || parentKind == "powershell", "PROOF_PARENT_KIND");
        ValidateProofLedger(all);
        List<Rec> targetStarts = all.FindAll(x => x.pid == pid && x.id == 1);
        List<Rec> starts = targetStarts.FindAll(x => x.parent == parentPid && Time(x.create_ft) >= parentCreateFt && Time(x.create_ft) <= snapCapFt + ToleranceTicks &&
            !all.Exists(z => z.id == 2 && InstanceKey(z) == InstanceKey(x) && Time(z.exit_ft) < snapStartFt - ToleranceTicks));
        Require(starts.Count <= 1, "PROOF_DUPLICATE_OR_AMBIGUOUS_INSTANCE");
        if(starts.Count == 0) { Require(targetStarts.Count == 0 && !all.Exists(x => x.pid == pid && x.id == 2), "PROOF_INSTANCE_NOT_ASSOCIATED"); return null; }
        List<Rec> ends = all.FindAll(x => x.id == 2 && InstanceKey(x) == InstanceKey(starts[0]));
        Require(ends.Count <= 1, "PROOF_DUPLICATE_INSTANCE");
        if(ends.Count == 0) { Require(!all.Exists(x => x.id == 2 && x.pid == pid && !targetStarts.Exists(z => InstanceKey(z) == InstanceKey(x))), "PROOF_PAIR_INSTANCE"); return null; }
        Rec a = starts[0], b = ends[0];
        Require(a.image == ConhostImage, "PROOF_START_IMAGE");
        Require(b.image == "conhost.exe" || b.image == ConhostImage, "PROOF_END_IMAGE");
        Require(ValidSchema(a.schema, 1) && ValidSchema(b.schema, 2) && a.version >= 0 && a.version <= 4 && b.version >= 0 && b.version <= 4, "PROOF_SCHEMA");
        long ca = Time(a.create_ft), cb = Time(b.create_ft), ex = Time(b.exit_ft);
        Require(ca == cb, "PROOF_PAIR_INSTANCE");
        Require(ex >= ca, "PROOF_EXIT_BEFORE_CREATE");
        Require(b.exit_code == 0, "PROOF_EXIT_CODE");
        Require(a.parent == parentPid, "PROOF_PARENT_PID");
        Require(a.session == expectedSession && a.session == parentSession, "PROOF_SESSION");
        List<Rec> ps = all.FindAll(x => x.pid == parentPid && x.id == 1 && Time(x.create_ft) == parentCreateFt), pe = all.FindAll(x => x.pid == parentPid && x.id == 2 && Time(x.create_ft) == parentCreateFt);
        Require(ps.Count == 1, "PROOF_PARENT_START_MISSING_OR_DUPLICATE");
        Require(pe.Count <= 1, "PROOF_PARENT_END_DUPLICATE");
        Rec p = ps[0];
        Require(Time(p.create_ft) == parentCreateFt, "PROOF_PARENT_CREATE");
        Require(p.image == (parentKind == "cmd" ? CmdImage : PowerShellImage) && p.session == parentSession, "PROOF_PARENT_IMAGE_OR_SESSION");
        Require(ca >= parentCreateFt, "PROOF_CHILD_BEFORE_PARENT");
        List<Rec> generations = ParentGenerations(all,parentPid,ca);
        Require(generations.Count == 1 && Time(generations[0].create_ft) == parentCreateFt, "PROOF_PARENT_GENERATION_AMBIGUOUS");
        Require(a.seq < b.seq && p.seq < a.seq && Time(a.event_ft) >= ca && Time(b.event_ft) >= ex, "PROOF_EVENT_CLOCK_OR_SEQUENCE");
        if (pe.Count == 1)
        {
            Require(Time(pe[0].create_ft) == parentCreateFt && ca <= Time(pe[0].exit_ft), "PROOF_CHILD_AFTER_PARENT_EXIT");
        }
        Require(ex >= snapStartFt - ToleranceTicks && ca <= snapCapFt + ToleranceTicks, "PROOF_SNAPSHOT_INTERVAL");
        return "{\"proof_kind\":\"MANIFEST_CONHOST_INSTANCE_EXIT_V1\",\"pid\":" + pid + ",\"parent_pid\":" + parentPid + ",\"parent_kind\":\"" + parentKind + "\",\"session\":" + a.session +
            ",\"create_filetime\":\"" + a.create_ft + "\",\"exit_filetime\":\"" + b.exit_ft + "\",\"exit_code\":" + b.exit_code + ",\"start_image\":\"" + a.image + "\",\"end_image\":\"" + b.image +
            "\",\"start_seq\":" + a.seq + ",\"end_seq\":" + b.seq + ",\"parent_start_seq\":" + p.seq + ",\"parent_create_filetime\":\"" + p.create_ft + "\",\"snapshot_start_filetime\":\"" + snapStartFt + "\",\"snapshot_captured_filetime\":\"" + snapCapFt +
            "\",\"tolerance_ticks\":" + ToleranceTicks + ",\"schema_start\":\"" + a.schema + "\",\"schema_end\":\"" + b.schema + "\"}";
    }

    public static long DateTimeTicksToFileTime(long ticks) { Require(ticks > FileTimeEpochTicks, "TICKS_NOT_AFTER_1601"); return ticks - FileTimeEpochTicks; }

    // Live consumer entry for the controller. Snapshot values are .NET DateTime ticks and are converted here.
    public static string ValidateConhostProof(string eventsPath, string haltedPath, int pid, int parentPid, long parentCreateDateTimeTicks, string parentKind, int parentSession, int expectedSession, long snapStartDateTimeTicks, long snapCapDateTimeTicks)
    {
        if (File.Exists(haltedPath)) throw new InvalidOperationException("OBSERVER_HALTED");
        string text;
        using (FileStream s = new FileStream(eventsPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        using (StreamReader rd = new StreamReader(s, new UTF8Encoding(false))) { Require(s.Length<=MaxBytes,"PROOF_EVENT_BYTES_LIMIT");text = rd.ReadToEnd(); }
        return ProofFromRecords(Parse(text), pid, parentPid, DateTimeTicksToFileTime(parentCreateDateTimeTicks), parentKind, parentSession, expectedSession, DateTimeTicksToFileTime(snapStartDateTimeTicks), DateTimeTicksToFileTime(snapCapDateTimeTicks));
    }

    const long K = 1000000L; // fixture unit: 0.1 s, larger than the 16 ms tolerance so boundaries are meaningful

    static Rec Mk(int id, int pid, int parent, int session, string image, long create, long exit, int code, int seq, int version)
    {
        Rec r = new Rec();
        r.seq = seq; r.id = id; r.pid = pid; r.parent = parent; r.session = session; r.image = image; r.version = version;
        r.create_ft = (create * K).ToString(); r.event_ft = ((id == 1 ? create : exit) * K + 5).ToString();
        if (id == 1) r.schema = "CreateTime:17,ImageName:1,ParentProcessID:8,ProcessID:8,SessionID:8";
        else { r.schema = "CreateTime:17,ExitCode:8,ExitTime:17,ImageName:2,ProcessID:8"; r.exit_ft = (exit * K).ToString(); r.exit_code = code; }
        return r;
    }

    // Fixture: parent(100) created 1000 exits 5000; conhost(200, parent 100) created 1100 exits 4000; times are in K ticks.
    static List<Rec> Base1(string parentImage)
    {
        List<Rec> l = new List<Rec>();
        l.Add(Mk(1, 100, 50, 3, parentImage, 1000, 0, 0, 1, 3));
        l.Add(Mk(1, 200, 100, 3, ConhostImage, 1100, 0, 0, 2, 3));
        l.Add(Mk(2, 200, -1, -1, "conhost.exe", 1100, 4000, 0, 3, 2));
        l.Add(Mk(2, 100, -1, -1, "cmd.exe", 1000, 5000, 0, 4, 2));
        return l;
    }

    static string Proof(List<Rec> l, string kind, int expectedSession, int parentSession, long parentCreate, long s0, long s1)
    {
        return ProofFromRecords(l, 200, 100, parentCreate, kind, parentSession, expectedSession, s0, s1);
    }

    // True only when the proof is refused with a contradiction. A pass or a silent "pending" counts as not rejected.
    static bool Rejects(List<Rec> l, string kind, int expectedSession, int parentSession, long parentCreate, long s0, long s1)
    {
        try { Proof(l, kind, expectedSession, parentSession, parentCreate, s0, s1); return false; }
        catch (InvalidOperationException) { return true; }
    }

    public static int SelfTest()
    {
        int n = 0;
        long S0 = 3000 * K, S1 = 3500 * K, PC = 1000 * K;
        Require(new DateTime(1601, 1, 1, 0, 0, 0, DateTimeKind.Utc).Ticks == FileTimeEpochTicks && DateTimeTicksToFileTime(FileTimeEpochTicks + 7) == 7, "EPOCH_CONSTANT"); n++;
        Require(NormalizeImage(@"\Device\HarddiskVolume2\Windows\System32\conhost.exe", @"\Device\HarddiskVolume2") == ConhostImage, "MAP_POSITIVE"); n++;
        Require(NormalizeImage(@"\Device\HarddiskVolume22\Windows\System32\conhost.exe", @"\Device\HarddiskVolume2") != ConhostImage, "MAP_PREFIX_NEGATIVE"); n++;
        Require(NormalizeImage(@"C:\Windows\System32\..\conhost.exe", @"\Device\HarddiskVolume2") != ConhostImage, "MAP_TRAVERSAL_NEGATIVE"); n++;
        Require(NormalizeImage("conhost.exe", @"\Device\HarddiskVolume2") == "conhost.exe", "MAP_BASENAME_KEPT"); n++;
        string ok = Proof(Base1(CmdImage), "cmd", 3, 3, PC, S0, S1);
        Require(ok != null && ok.IndexOf("MANIFEST_CONHOST_INSTANCE_EXIT_V1", StringComparison.Ordinal) > 0, "PROOF_POSITIVE_CMD"); n++;
        Require(Proof(Base1(PowerShellImage), "powershell", 3, 3, PC, S0, S1) != null, "PROOF_POSITIVE_POWERSHELL"); n++;
        List<Rec> x = Base1(CmdImage); x.RemoveAt(2);
        Require(Proof(x, "cmd", 3, 3, PC, S0, S1) == null, "PENDING_WITHOUT_END"); n++;
        x = Base1(CmdImage); x.RemoveAt(1); x.RemoveAt(1);
        Require(Proof(x, "cmd", 3, 3, PC, S0, S1) == null, "PENDING_WITHOUT_START_AND_END"); n++;
        List<List<Rec>> bad = new List<List<Rec>>();
        x = Base1(CmdImage); x.Add(Mk(1, 200, 100, 3, ConhostImage, 1100, 0, 0, 5, 3)); bad.Add(x);   // duplicate Start for the PID
        x = Base1(CmdImage); x.Add(Mk(2, 200, -1, -1, "conhost.exe", 1100, 4000, 0, 5, 2)); bad.Add(x); // duplicate End for the PID
        x = Base1(CmdImage); x[1].parent = 999; bad.Add(x);                                          // wrong parent
        x = Base1(CmdImage); x[1].session = 0; bad.Add(x);                                           // wrong session
        x = Base1(CmdImage); x[1].image = "c:/temp/conhost.exe"; bad.Add(x);                         // wrong full image
        x = Base1(CmdImage); x[1].image = CmdImage; bad.Add(x);                                      // not conhost
        x = Base1(CmdImage); x[2].image = "cmd.exe"; bad.Add(x);                                     // End image differs
        x = Base1(CmdImage); x[2].exit_code = 7; bad.Add(x);                                         // nonzero exit
        x = Base1(CmdImage); x[2].create_ft = (1101 * K).ToString(); bad.Add(x);                     // PID reuse: End create differs
        x = Base1(CmdImage); x[2].exit_ft = (1099 * K).ToString(); bad.Add(x);                       // exit before create
        x = Base1(CmdImage); x[0].create_ft = (1001 * K).ToString(); bad.Add(x);                     // parent create differs from the held handle
        x = Base1(CmdImage); x.RemoveAt(0); bad.Add(x);                                              // parent Start missing
        x = Base1(CmdImage); x[0].image = "c:/windows/system32/notcmd.exe"; bad.Add(x);              // parent image wrong
        x = Base1(CmdImage); x[0].session = 0; bad.Add(x);                                           // parent session differs
        x = Base1(CmdImage); x[1].create_ft = (900 * K).ToString(); x[2].create_ft = (900 * K).ToString(); bad.Add(x); // child before parent
        x = Base1(CmdImage); x[3].exit_ft = (1050 * K).ToString(); bad.Add(x);                       // child after parent exit
        x = Base1(CmdImage); x[1].schema = "unknown:999"; bad.Add(x);                                // schema
        x = Base1(CmdImage); x[1].version = 9; bad.Add(x);                                           // version
        x = Base1(CmdImage); x.RemoveAt(1); bad.Add(x);                                              // End without Start
        x = Base1(CmdImage); x[2].exit_ft = "0"; bad.Add(x);                                         // invalid FILETIME
        foreach (List<Rec> m in bad) { Require(Rejects(m, "cmd", 3, 3, PC, S0, S1), "NEGATIVE_NOT_REJECTED_" + n); n++; }
        Require(Rejects(Base1(CmdImage), "powershell", 3, 3, PC, S0, S1), "KIND_MISMATCH_NOT_REJECTED"); n++;
        Require(Rejects(Base1(CmdImage), "cmd", 0, 3, PC, S0, S1), "EXPECTED_SESSION_NOT_REJECTED"); n++;
        Require(Rejects(Base1(CmdImage), "cmd", 3, 0, PC, S0, S1), "PARENT_SESSION_NOT_REJECTED"); n++;
        Require(Rejects(Base1(CmdImage), "cmd", 3, 3, PC, S1, S0), "SNAPSHOT_ORDER_NOT_REJECTED"); n++;
        // Snapshot interval boundaries around the conhost life [1100K, 4000K] with a 16 ms (160000 tick) tolerance.
        long ex = 4000 * K, ca = 1100 * K;
        Require(Proof(Base1(CmdImage), "cmd", 3, 3, PC, ex + ToleranceTicks, ex + ToleranceTicks + 5) != null, "BOUNDARY_EXIT_EXACT_PASS"); n++;
        Require(Rejects(Base1(CmdImage), "cmd", 3, 3, PC, ex + ToleranceTicks + 1, ex + ToleranceTicks + 5), "BOUNDARY_EXIT_PLUS_ONE_REJECT"); n++;
        Require(Proof(Base1(CmdImage), "cmd", 3, 3, PC, ca - ToleranceTicks - 5, ca - ToleranceTicks) != null, "BOUNDARY_CREATE_EXACT_PASS"); n++;
        Require(Rejects(Base1(CmdImage), "cmd", 3, 3, PC, ca - ToleranceTicks - 6, ca - ToleranceTicks - 1), "BOUNDARY_CREATE_MINUS_ONE_REJECT"); n++;
        // Epoch mix-up: a .NET tick value where a FILETIME is required cannot equal the handle-derived parent time.
        Require(Rejects(Base1(CmdImage), "cmd", 3, 3, PC + FileTimeEpochTicks, S0, S1), "EPOCH_MIXUP_NOT_REJECTED"); n++;
        List<Rec> generationsTest = Base1(CmdImage);
        generationsTest.Add(Mk(1,100,50,3,CmdImage,6000,0,0,5,3));
        generationsTest.Add(Mk(1,200,100,3,ConhostImage,6100,0,0,6,3));
        generationsTest.Add(Mk(2,200,-1,-1,"conhost.exe",6100,8000,0,7,2));
        generationsTest.Add(Mk(2,100,-1,-1,"cmd.exe",6000,9000,0,8,2));
        Require(Proof(generationsTest,"cmd",3,3,6000*K,7000*K,7500*K)!=null,"REUSED_PARENT_AND_CHILD_PROOF");n++;
        List<Rec> ledger = new List<Rec>();
        foreach(Rec e in generationsTest){ValidateInstanceEvent(ledger,e,50,500*K);ledger.Add(e);}n++;
        Rec duplicate = generationsTest[4]; bool refused=false;try{ValidateInstanceEvent(ledger,duplicate,50,500*K);}catch(InvalidOperationException){refused=true;}Require(refused,"DUPLICATE_GENERATION_START_REFUSED");n++;
        refused=false;try{ValidateInstanceEvent(ledger,generationsTest[6],50,500*K);}catch(InvalidOperationException){refused=true;}Require(refused,"DUPLICATE_GENERATION_END_REFUSED");n++;
        Rec wrong= Mk(2,200,-1,-1,"conhost.exe",6101,8000,0,9,2);refused=false;try{ValidateInstanceEvent(ledger,wrong,50,500*K);}catch(InvalidOperationException){refused=true;}Require(refused,"WRONG_GENERATION_END_REFUSED");n++;
        return n;
    }

    static string Json(object x)
    {
        if (x == null) return "null";
        string str = x as string;
        if (str != null)
        {
            StringBuilder b = new StringBuilder("\"");
            foreach (char c in str) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
            return b.Append('"').ToString();
        }
        if (x is bool) return (bool)x ? "true" : "false";
        if (x.GetType().IsPrimitive) return Convert.ToString(x, System.Globalization.CultureInfo.InvariantCulture);
        System.Collections.IEnumerable seq = x as System.Collections.IEnumerable;
        if (seq != null)
        {
            StringBuilder b = new StringBuilder("[");
            bool comma = false;
            foreach (object v in seq) { if (comma) b.Append(','); b.Append(Json(v)); comma = true; }
            return b.Append(']').ToString();
        }
        StringBuilder obj = new StringBuilder("{");
        bool next = false;
        foreach (System.Reflection.FieldInfo f in x.GetType().GetFields())
        {
            if (next) obj.Append(',');
            obj.Append(Json(f.Name)).Append(':').Append(Json(f.GetValue(x)));
            next = true;
        }
        return obj.Append('}').ToString();
    }

    // Args: run <request_id> <dispatcher_pid> <dispatcher_creation_filetime> <observer_dir> <master_sha256> <revision_sha256> <dispatcher_session>
    public static int Main(string[] args)
    {
        Final r;
        try
        {
            Require(args.Length == 8 && args[0] == "run", "USAGE");
            r = Run(args[1], int.Parse(args[2]), args[3], args[4], args[5], args[6], int.Parse(args[7]));
        }
        catch (Exception ex) { r = new Final(); r.error = ex.GetType().Name + ":" + ex.Message; }
        try
        {
            if (r.request_id != null && args.Length == 8) SaveNew(Path.Combine(args[4], "observer-final.json"), Json(r) + "\n");
        }
        catch (Exception ex) { r.error = (r.error == null ? "" : r.error + ";") + "FINAL_WRITE:" + ex.Message; }
        using (StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false))) { output.WriteLine(Json(r)); output.Flush(); }
        return r.status == "OBSERVER_FINAL_CLOSED" ? 0 : 2;
    }
}
