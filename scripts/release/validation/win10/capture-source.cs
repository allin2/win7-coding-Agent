using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading.Tasks;
using System.IO;
using System.Text;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;

public static class A31Capture {
 public const string ApiProfile="WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V5_TEST_ONLY";
 public const string ApiContract="QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V5";
 public const string PreciseUtcClockProfile="LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY";
 [DllImport("kernel32.dll",ExactSpelling=true)] static extern void GetSystemTimePreciseAsFileTime(out long fileTime);
 public static long PreciseUtcTicks(){long value;GetSystemTimePreciseAsFileTime(out value);if(value<=0)throw new InvalidOperationException("LIFECYCLE_PRECISE_UTC_UNKNOWN");return DateTime.FromFileTimeUtc(value).Ticks;}
 public const uint QueryAccess=0x00101000;
 public const uint ImageNameFlags=1; // Query the native path on the retained process object, including after exit.
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Entry { public uint Size,Usage,Pid;public UIntPtr Heap;public uint Module,Threads,Parent;public int Priority;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Exe; }
 public sealed class Row { public int Pid,Parent;public string Exe;public long SnapshotStartedTicks,SnapshotCapturedTicks;public string ClockProfile="UNKNOWN"; }
 public sealed class Identity {public string Sid,User,IntegritySid;public int Pid,Session,Rid,ElevationType;public bool Elevated,Ordinary,InJob;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",EntryPoint="Process32FirstW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool First(IntPtr s,ref Entry e);
 [DllImport("kernel32.dll",EntryPoint="Process32NextW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Next(IntPtr s,ref Entry e);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr p);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetProcessId(QueryHandle handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(QueryHandle handle,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(QueryHandle handle,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(QueryHandle handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid,out uint session);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageNameW(QueryHandle handle,uint flags,StringBuilder image,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr p,IntPtr job,out bool result);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int kind,IntPtr data,int len,out int required);
 static Exception Err(string what){return new Win32Exception(Marshal.GetLastWin32Error(),what);}
 public sealed class QueryHandle:SafeHandleZeroOrMinusOneIsInvalid {
  public int CloseError;public bool CloseFailed;
  public QueryHandle(IntPtr h):base(true){SetHandle(h);}
  protected override bool ReleaseHandle(){bool ok=CloseHandle(handle);if(!ok){CloseFailed=true;CloseError=Marshal.GetLastWin32Error();}return ok;}
 }
 public sealed class QueryProcess:IDisposable {
  readonly QueryHandle handle;
  readonly int pid,session;
  readonly DateTime start;
  readonly string image;
  bool disposed;
  internal QueryProcess(int expectedPid){
   if(expectedPid<1)throw new ArgumentOutOfRangeException("expectedPid");
   IntPtr raw=OpenProcess(QueryAccess,false,expectedPid);
   if(raw==IntPtr.Zero)throw Err("LIFECYCLE_OPEN_QUERY_HANDLE");
   handle=new QueryHandle(raw);
   try{
    uint actual=GetProcessId(handle);if(actual==0)throw Err("LIFECYCLE_QUERY_PID");
    if(actual!=(uint)expectedPid)throw new InvalidOperationException("LIFECYCLE_PID_MISMATCH");pid=expectedPid;
    uint s;if(!ProcessIdToSessionId(actual,out s))throw Err("LIFECYCLE_QUERY_SESSION");session=checked((int)s);
    long c,e,k,u;if(!GetProcessTimes(handle,out c,out e,out k,out u))throw Err("LIFECYCLE_QUERY_TIMES");start=DateTime.FromFileTimeUtc(c);
    var b=new StringBuilder(32768);uint n=32768;if(!QueryFullProcessImageNameW(handle,ImageNameFlags,b,ref n))throw Err("LIFECYCLE_QUERY_IMAGE");image=b.ToString();
   }catch{handle.Dispose();throw;}
  }
  void Check(){if(disposed||handle.IsClosed||handle.IsInvalid)throw new ObjectDisposedException("QueryProcess");}
  public int Id{get{Check();return pid;}}
  public int SessionId{get{Check();return session;}}
  public DateTime StartTime{get{Check();return start;}}
  public string ImagePath{get{Check();return image;}}
  public IntPtr Handle{get{Check();return handle.DangerousGetHandle();}}
  public uint RequestedAccess{get{Check();return QueryAccess;}}
  public bool Inheritable{get{Check();return false;}}
  public bool WaitForExit(int milliseconds){
   Check();if(milliseconds<0||milliseconds>210000)throw new ArgumentOutOfRangeException("milliseconds");
   uint result=WaitForSingleObject(handle,(uint)milliseconds);
   if(result==0)return true;if(result==258)return false;
   if(result==0xffffffff)throw Err("LIFECYCLE_WAIT_QUERY_HANDLE");throw new InvalidOperationException("LIFECYCLE_UNEXPECTED_WAIT");
  }
  public bool HasExited{get{return WaitForExit(0);}}
  public int ExitCode{get{Check();if(!HasExited)throw new InvalidOperationException("LIFECYCLE_EXIT_NOT_PROVEN");uint code;if(!GetExitCodeProcess(handle,out code))throw Err("LIFECYCLE_QUERY_EXIT_CODE");return unchecked((int)code);}}
  public DateTime ExitTime{get{Check();if(!HasExited)throw new InvalidOperationException("LIFECYCLE_EXIT_NOT_PROVEN");long c,e,k,u;if(!GetProcessTimes(handle,out c,out e,out k,out u))throw Err("LIFECYCLE_QUERY_EXIT_TIME");if(e<=0)throw new InvalidOperationException("LIFECYCLE_EXIT_TIME_UNKNOWN");return DateTime.FromFileTimeUtc(e);}}
  public bool HasExitedStrict(){return WaitForExit(0);}
  public int ReadExitCode(){return ExitCode;}
  public DateTime ReadExitTime(){return ExitTime;}
  internal Identity ReadToken(){Check();bool added=false;try{handle.DangerousAddRef(ref added);return TokenFromHandle(handle.DangerousGetHandle(),pid,session);}finally{if(added)handle.DangerousRelease();}}
  public void Dispose(){if(disposed)return;disposed=true;handle.Dispose();if(handle.CloseFailed)throw new Win32Exception(handle.CloseError,"LIFECYCLE_CLOSE_QUERY_HANDLE");}
 }
 public static QueryProcess OpenQuery(int pid){return new QueryProcess(pid);}
 public static Identity Token(Process p){return TokenFromHandle(p.Handle,p.Id,p.SessionId);}
 public static Identity Token(QueryProcess p){return p.ReadToken();}
 public static Row[] Snapshot(){
  var rows=new List<Row>();long begun=PreciseUtcTicks();IntPtr s=CreateToolhelp32Snapshot(2,0);if(s==new IntPtr(-1))throw Err("LIFECYCLE_SNAPSHOT");
  try{long captured=PreciseUtcTicks();if(begun<=0||captured<begun)throw new InvalidOperationException("LIFECYCLE_SNAPSHOT_INTERVAL_UNKNOWN");var e=new Entry{Size=(uint)Marshal.SizeOf(typeof(Entry))};if(!First(s,ref e))throw Err("LIFECYCLE_FIRST");do{if(rows.Count>=32768)throw new InvalidOperationException("SAFETY_SNAPSHOT_LIMIT");rows.Add(new Row{Pid=(int)e.Pid,Parent=(int)e.Parent,Exe=e.Exe,SnapshotStartedTicks=begun,SnapshotCapturedTicks=captured,ClockProfile=PreciseUtcClockProfile});}while(Next(s,ref e));if(Marshal.GetLastWin32Error()!=18)throw Err("LIFECYCLE_NEXT");return rows.ToArray();}finally{if(!CloseHandle(s))throw Err("LIFECYCLE_SNAPSHOT_CLOSE");}
 }
 public sealed class Proof {public object ParentPid="UNKNOWN",ParentImage="UNKNOWN",SecondParentCreationTicks="UNKNOWN",SecondParentSession="UNKNOWN",SecondParentImage="UNKNOWN",SecondQueryTicks="UNKNOWN",SnapshotStartedTicks="UNKNOWN",SnapshotCapturedTicks="UNKNOWN",QueryTicks="UNKNOWN",ActualPid="UNKNOWN",CreationTicks="UNKNOWN",Session="UNKNOWN",Image="UNKNOWN",ParentCreationTicks="UNKNOWN",ParentSession="UNKNOWN",ParentExitTicks="UNKNOWN",SecondStartedTicks="UNKNOWN",SecondCapturedTicks="UNKNOWN",SecondPid="UNKNOWN",SecondParent="UNKNOWN",SecondExe="UNKNOWN",SecondCreationTicks="UNKNOWN",SecondSession="UNKNOWN",SecondImage="UNKNOWN";public string ClockProfile="UNKNOWN",SecondObservation="NOT_REQUIRED",Ownership="UNKNOWN";}
 public sealed class Held {public QueryProcess Process;public int Pid,Parent,Session;public long CreationTicks;public string PinnedAt;public Proof Binding;}
 public sealed class Gap {public int Pid,Parent;public int? NativeError;public bool NativeErrorKnown;public string Exe,ObservedAt,Step,ErrorType,Error;public Proof Binding;}
 public sealed class Exclusion {public int Pid,Parent;public string Reason="CHILD_CREATED_BEFORE_PINNED_PARENT",ObservedAt;public Proof Binding;}
 public sealed class CaptureResult {public Held[] Added;public Gap[] Gaps;public Exclusion[] Excluded;}
 static Held Hold(QueryProcess p,int parent){return new Held{Process=p,Pid=p.Id,Parent=parent,Session=p.SessionId,CreationTicks=p.StartTime.Ticks,PinnedAt=new DateTime(PreciseUtcTicks(),DateTimeKind.Utc).ToString("o")};}
 public static Held Pin(Process p,int parent){
  QueryProcess q=OpenQuery(p.Id);try{if(q.StartTime.Ticks!=p.StartTime.ToUniversalTime().Ticks||q.SessionId!=p.SessionId)throw new InvalidOperationException("LIFECYCLE_OWNED_INSTANCE_MISMATCH");return Hold(q,parent);}catch{q.Dispose();throw;}
 }
 static Gap Failure(Row row,string step,string at,Exception e,Proof proof){var w=e as Win32Exception;return new Gap{Pid=row.Pid,Parent=row.Parent,Exe=row.Exe,ObservedAt=at,Step=step,ErrorType=e.GetType().FullName,NativeErrorKnown=w!=null,NativeError=w==null?(int?)null:w.NativeErrorCode,Error=e.Message,Binding=proof};}
 sealed class SecondSnapshot {readonly Func<Row[]> observe;Row[] rows;Exception error;bool taken;public SecondSnapshot(Func<Row[]> f){observe=f;}public Row[] GetFresh(){Row[] fresh=observe();if(fresh==null||fresh.Length>32768)throw new InvalidOperationException("LIFECYCLE_SECOND_SNAPSHOT_UNKNOWN");return fresh;}public Row[] Get(){if(!taken){taken=true;try{rows=observe();if(rows==null||rows.Length>32768)throw new InvalidOperationException("LIFECYCLE_SECOND_SNAPSHOT_UNKNOWN");}catch(Exception e){error=e;}}if(error!=null)throw error;return rows;}}
 static void ParentGate(Held child,Held parent,Proof proof){
  proof.ParentCreationTicks=parent.CreationTicks;proof.ParentSession=parent.Session;
  if(parent.CreationTicks<=0||parent.Process.Id!=parent.Pid||parent.Process.StartTime.Ticks!=parent.CreationTicks||parent.Process.SessionId!=parent.Session)throw new InvalidOperationException("LIFECYCLE_PARENT_HELD_INSTANCE_MISMATCH");
  if(child.CreationTicks<parent.CreationTicks)throw new InvalidOperationException("LIFECYCLE_PARENT_CREATION_MISMATCH");
  if(child.Session!=parent.Session)throw new InvalidOperationException("LIFECYCLE_PARENT_SESSION_MISMATCH");
  if(parent.Process.HasExitedStrict()){long exited=parent.Process.ReadExitTime().Ticks;proof.ParentExitTicks=exited;if(child.CreationTicks>exited)throw new InvalidOperationException("LIFECYCLE_PARENT_EXIT_BOUNDARY_MISMATCH");}else proof.ParentExitTicks="NOT_EXITED_AT_QUERY";
 }
 // The second observation and its preflight counterexamples use this same comparison.
 // Both queries remain real retained handles; expected metadata is never used to create a Held object.
 public static void AssertSameInstance(QueryProcess original,QueryProcess check,int expectedPid,long expectedCreation,int expectedSession,string expectedImage){
  if(original.Id!=expectedPid||check.Id!=expectedPid||original.StartTime.Ticks!=expectedCreation||check.StartTime.Ticks!=expectedCreation||original.SessionId!=expectedSession||check.SessionId!=expectedSession||!String.Equals(original.ImagePath,expectedImage,StringComparison.OrdinalIgnoreCase)||!String.Equals(check.ImagePath,expectedImage,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("LIFECYCLE_SECOND_INSTANCE_MISMATCH");
 }
 // Only this path may exclude an observation; all native failures remain Gaps.
 static Exclusion ProveNonChild(Row row,Held parent,QueryProcess child,Proof proof,SecondSnapshot second,string at){
  if(parent.Process.Id!=parent.Pid||parent.Process.StartTime.Ticks!=parent.CreationTicks||parent.Process.SessionId!=parent.Session)throw new InvalidOperationException("LIFECYCLE_PARENT_HELD_INSTANCE_MISMATCH");
  if(child.StartTime.Ticks>=parent.CreationTicks||parent.CreationTicks>row.SnapshotStartedTicks||proof.QueryTicks is string||(long)proof.QueryTicks<row.SnapshotCapturedTicks)throw new InvalidOperationException("LIFECYCLE_EXCLUSION_CLOCK_OR_CREATION");
  Row match=null;foreach(Row x in second.GetFresh()){if(x.Pid==row.Pid){if(match!=null)throw new InvalidOperationException("LIFECYCLE_SECOND_DUPLICATE_PID");match=x;}}
  if(match==null)throw new InvalidOperationException("LIFECYCLE_SECOND_OBSERVATION_MISSING");
  proof.ParentPid=parent.Pid;proof.ParentImage=parent.Process.ImagePath;proof.SecondStartedTicks=match.SnapshotStartedTicks;proof.SecondCapturedTicks=match.SnapshotCapturedTicks;proof.SecondPid=match.Pid;proof.SecondParent=match.Parent;proof.SecondExe=match.Exe;
  if(match.ClockProfile!=PreciseUtcClockProfile||match.Parent!=row.Parent||!String.Equals(match.Exe,row.Exe,StringComparison.OrdinalIgnoreCase)||match.SnapshotStartedTicks<(long)proof.QueryTicks||match.SnapshotCapturedTicks<match.SnapshotStartedTicks)throw new InvalidOperationException("LIFECYCLE_SECOND_EXCLUSION_BINDING");
  QueryProcess childCheck=null,parentCheck=null;
  try{
   proof.SecondQueryTicks=PreciseUtcTicks();if((long)proof.SecondQueryTicks<match.SnapshotCapturedTicks)throw new InvalidOperationException("LIFECYCLE_SECOND_QUERY_CLOCK");
   childCheck=OpenQuery(row.Pid);parentCheck=OpenQuery(parent.Pid);
   AssertSameInstance(child,childCheck,row.Pid,child.StartTime.Ticks,child.SessionId,child.ImagePath);
   AssertSameInstance(parent.Process,parentCheck,parent.Pid,parent.CreationTicks,parent.Session,parent.Process.ImagePath);
   proof.SecondCreationTicks=childCheck.StartTime.Ticks;proof.SecondSession=childCheck.SessionId;proof.SecondImage=childCheck.ImagePath;proof.SecondParentCreationTicks=parentCheck.StartTime.Ticks;proof.SecondParentSession=parentCheck.SessionId;proof.SecondParentImage=parentCheck.ImagePath;
  }finally{try{if(childCheck!=null)childCheck.Dispose();}finally{if(parentCheck!=null)parentCheck.Dispose();}}
  proof.SecondObservation="SAME_CHILD_AND_PARENT_INSTANCES_PROVEN_HANDLES_RETAINED";proof.Ownership="EXCLUDED_NOT_CHILD_OF_PINNED_PARENT";
  return new Exclusion{Pid=row.Pid,Parent=row.Parent,ObservedAt=at,Binding=proof};
 }
 static void CaptureRow(Row row,Dictionary<int,Held> known,HashSet<int> attempted,List<Held> added,List<Gap> gaps,List<Exclusion> excluded,SecondSnapshot second){
  if(known.ContainsKey(row.Pid)){
   if(!attempted.Add(row.Pid))return;QueryProcess current=null;
   try{Held prior=known[row.Pid];if(prior.Process.HasExitedStrict()){current=OpenQuery(row.Pid);if(current.StartTime.Ticks!=prior.CreationTicks)throw new InvalidOperationException("LIFECYCLE_CAPTURE_HELD_PID_REUSE_NOT_TRACKED");}}
   catch(Exception e){gaps.Add(Failure(row,"KnownPidGeneration",new DateTime(PreciseUtcTicks(),DateTimeKind.Utc).ToString("o"),e,new Proof()));}
   finally{if(current!=null){try{current.Dispose();}catch(Exception e){gaps.Add(Failure(row,"KnownPidGenerationClose",new DateTime(PreciseUtcTicks(),DateTimeKind.Utc).ToString("o"),e,new Proof()));}}}return;
  }
  if(!known.ContainsKey(row.Parent)||!attempted.Add(row.Pid))return;
  QueryProcess p=null;string step="SnapshotInterval";string at=new DateTime(PreciseUtcTicks(),DateTimeKind.Utc).ToString("o");var proof=new Proof{SnapshotStartedTicks=row.SnapshotStartedTicks,SnapshotCapturedTicks=row.SnapshotCapturedTicks,ClockProfile=row.ClockProfile};
  try{Held parent=known[row.Parent];proof.ParentCreationTicks=parent.CreationTicks;proof.ParentSession=parent.Session;if(parent.Process.HasExitedStrict())proof.ParentExitTicks=parent.Process.ReadExitTime().Ticks;else proof.ParentExitTicks="NOT_EXITED_AT_QUERY";
   if(row.ClockProfile!=PreciseUtcClockProfile)throw new InvalidOperationException("LIFECYCLE_SNAPSHOT_CLOCK_PROFILE");if(row.SnapshotStartedTicks<=0||row.SnapshotCapturedTicks<=0||row.SnapshotCapturedTicks<row.SnapshotStartedTicks)throw new InvalidOperationException("LIFECYCLE_SNAPSHOT_INTERVAL_UNKNOWN");step="OpenQueryHandle";proof.QueryTicks=PreciseUtcTicks();p=OpenQuery(row.Pid);proof.ActualPid=p.Id;proof.CreationTicks=p.StartTime.Ticks;proof.Session=p.SessionId;proof.Image=p.ImagePath;step="ParentCreationSession";Held h=Hold(p,row.Parent);
   step="SnapshotCreationBoundary";if(h.CreationTicks>row.SnapshotCapturedTicks)throw new InvalidOperationException("LIFECYCLE_CREATED_AFTER_SNAPSHOT_CAPTURE");
   step="SnapshotImage";
   if(String.IsNullOrEmpty(row.Exe)||!String.Equals(Path.GetFileName(p.ImagePath),row.Exe,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("LIFECYCLE_IMAGE_MISMATCH");
   if(h.CreationTicks<parent.CreationTicks){step="ProveNonChild";var exclusion=ProveNonChild(row,parent,p,proof,second,at);p.Dispose();p=null;excluded.Add(exclusion);return;}
   step="ParentCreationSession";ParentGate(h,parent,proof);
   if(h.CreationTicks>row.SnapshotStartedTicks){
    proof.SecondObservation="PROVISIONAL_NOT_DISPATCHABLE";step="SecondSnapshot";Row match=null;foreach(var candidate in second.Get()){if(candidate.Pid==row.Pid){if(match!=null)throw new InvalidOperationException("LIFECYCLE_SECOND_DUPLICATE_PID");match=candidate;}}
    if(match==null)throw new InvalidOperationException("LIFECYCLE_SECOND_OBSERVATION_MISSING");proof.SecondStartedTicks=match.SnapshotStartedTicks;proof.SecondCapturedTicks=match.SnapshotCapturedTicks;proof.SecondPid=match.Pid;proof.SecondParent=match.Parent;proof.SecondExe=match.Exe;
    step="SecondSnapshotBinding";if(match.ClockProfile!=PreciseUtcClockProfile)throw new InvalidOperationException("LIFECYCLE_SECOND_CLOCK_PROFILE");if(match.SnapshotStartedTicks<=0||match.SnapshotCapturedTicks<match.SnapshotStartedTicks||match.SnapshotStartedTicks<row.SnapshotCapturedTicks)throw new InvalidOperationException("LIFECYCLE_SECOND_INTERVAL_UNKNOWN");
    if(match.Parent!=row.Parent)throw new InvalidOperationException("LIFECYCLE_SECOND_PARENT_MISMATCH");if(!String.Equals(match.Exe,row.Exe,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("LIFECYCLE_SECOND_IMAGE_MISMATCH");if(h.CreationTicks>match.SnapshotStartedTicks)throw new InvalidOperationException("LIFECYCLE_SECOND_CREATION_BOUNDARY_MISMATCH");
    QueryProcess check=null;try{step="SecondQueryHandle";check=OpenQuery(row.Pid);proof.SecondCreationTicks=check.StartTime.Ticks;proof.SecondSession=check.SessionId;proof.SecondImage=check.ImagePath;
     AssertSameInstance(p,check,h.Pid,h.CreationTicks,h.Session,p.ImagePath);ParentGate(h,parent,proof);
    }finally{if(check!=null){try{check.Dispose();}catch{step="SecondQueryClose";throw;}}}
    proof.SecondObservation="SAME_INSTANCE_PROVEN_ORIGINAL_HANDLE_RETAINED";
   }
   proof.Ownership="PROVEN";h.Binding=proof;
   known.Add(h.Pid,h);added.Add(h);p=null;
  }catch(Exception e){gaps.Add(Failure(row,step,at,e,proof));}
  finally{if(p!=null){try{p.Dispose();}catch(Exception e){gaps.Add(Failure(row,"DisposeQueryHandle",at,e,proof));}}}
 }
 static CaptureResult CaptureRows(Held[] held,Row[] rows,Func<Row[]> observe){
  var known=new Dictionary<int,Held>();foreach(var p in held)known.Add(p.Pid,p);var attempted=new HashSet<int>();var added=new List<Held>();var gaps=new List<Gap>();var excluded=new List<Exclusion>();
  if(rows==null||rows.Length>32768)throw new InvalidOperationException("SAFETY_SNAPSHOT_LIMIT");var second=new SecondSnapshot(observe);
  int count;do{count=added.Count;foreach(var row in rows){CaptureRow(row,known,attempted,added,gaps,excluded,second);if(gaps.Count>=128)return new CaptureResult{Added=added.ToArray(),Gaps=gaps.ToArray(),Excluded=excluded.ToArray()};}}while(added.Count!=count);
  return new CaptureResult{Added=added.ToArray(),Gaps=gaps.ToArray(),Excluded=excluded.ToArray()};
 }
 public static CaptureResult CaptureObserved(Held[] held,Row[] rows){return CaptureRows(held,rows,Snapshot);}
 // Fabricated second rows are accepted only by this explicit preflight test seam, never by Capture/Update-Tree.
 public static CaptureResult CaptureObservedForTest(Held[] held,Row[] rows,Row[] secondRows){return CaptureRows(held,rows,delegate{return secondRows;});}
 public static CaptureResult Capture(Held[] held){try{return CaptureObserved(held,Snapshot());}catch(Exception e){return new CaptureResult{Added=new Held[0],Excluded=new Exclusion[0],Gaps=new[]{Failure(new Row{Pid=0,Parent=0,Exe="UNKNOWN"},"SnapshotException",new DateTime(PreciseUtcTicks(),DateTimeKind.Utc).ToString("o"),e,new Proof())}};}}
 static Identity TokenFromHandle(IntPtr handle,int pid,int session){IntPtr t,b=IntPtr.Zero;if(!OpenProcessToken(handle,8,out t))throw Err("IDENTITY_OPEN");try{var i=new Identity{Pid=pid,Session=session};int n;GetTokenInformation(t,1,IntPtr.Zero,0,out n);if(n<=0||n>65536)throw Err("IDENTITY_USER_SIZE");b=Marshal.AllocHGlobal(n);if(!GetTokenInformation(t,1,b,n,out n))throw Err("IDENTITY_USER");var userSid=new SecurityIdentifier(Marshal.ReadIntPtr(b));i.Sid=userSid.Value;i.User=userSid.Translate(typeof(NTAccount)).Value;Marshal.FreeHGlobal(b);b=IntPtr.Zero;GetTokenInformation(t,2,IntPtr.Zero,0,out n);if(n<=0||n>65536)throw Err("IDENTITY_GROUP_SIZE");b=Marshal.AllocHGlobal(n);if(!GetTokenInformation(t,2,b,n,out n))throw Err("IDENTITY_GROUPS");int groups=Marshal.ReadInt32(b);i.Ordinary=true;for(int g=0;g<groups;g++){int off=IntPtr.Size+g*(IntPtr.Size==8?16:8);var sid=new SecurityIdentifier(Marshal.ReadIntPtr(b,off));int flags=Marshal.ReadInt32(b,off+IntPtr.Size);if(sid.Value=="S-1-5-32-544"&&(flags&4)!=0&&(flags&16)==0)i.Ordinary=false;}Marshal.FreeHGlobal(b);b=Marshal.AllocHGlobal(4);if(!GetTokenInformation(t,20,b,4,out n))throw Err("IDENTITY_ELEVATION");i.Elevated=Marshal.ReadInt32(b)!=0;if(!GetTokenInformation(t,18,b,4,out n))throw Err("IDENTITY_TYPE");i.ElevationType=Marshal.ReadInt32(b);Marshal.FreeHGlobal(b);b=IntPtr.Zero;GetTokenInformation(t,25,IntPtr.Zero,0,out n);if(n<=0||n>65536)throw Err("IDENTITY_INTEGRITY_SIZE");b=Marshal.AllocHGlobal(n);if(!GetTokenInformation(t,25,b,n,out n))throw Err("IDENTITY_INTEGRITY");i.IntegritySid=new SecurityIdentifier(Marshal.ReadIntPtr(b)).Value;i.Rid=int.Parse(i.IntegritySid.Substring(i.IntegritySid.LastIndexOf('-')+1));bool j;if(!IsProcessInJob(handle,IntPtr.Zero,out j))throw Err("IDENTITY_JOB");i.InJob=j;return i;}finally{if(b!=IntPtr.Zero)Marshal.FreeHGlobal(b);CloseHandle(t);}}
 public sealed class Drain {public Task Work;public string Text;public bool Overflow,Failed;public Drain(StreamReader r){Work=Task.Run(()=>{try{var s=new StringBuilder();var b=new char[4096];int n;while((n=r.Read(b,0,b.Length))>0){if(s.Length+n<=1048576)s.Append(b,0,n);else Overflow=true;}Text=s.ToString();}catch{Failed=true;}});}}
}
