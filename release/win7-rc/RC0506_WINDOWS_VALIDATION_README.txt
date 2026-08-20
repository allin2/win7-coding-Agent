A7 RC-05 / RC-06 Windows validation kit v4

This kit validates the already locked product ZIP. It does not modify or replace the
product package, and it must not be used to claim full Win10, Win7 or RC PASS.

Required product ZIP SHA-256:
39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9

Run from a normal cmd.exe window after extracting both ZIP files to new local NTFS SSD
directories. Keep the validation kit outside the product root. Evidence and user-data
directories must be absent or empty; never reuse a previous round.

  certutil -hashfile C:\path\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip SHA256
  certutil -hashfile C:\path\RC0506_WINDOWS_VALIDATION_KIT_20260816-v4.zip SHA256
  C:\rc0506-kit\RUN_RC0506.cmd C:\product\Win7CodingAgent-0.1.0-rc.1-win7-x64 C:\rc0506-evidence C:\rc0506-user-data
  set RC0506_EXIT_CODE=%ERRORLEVEL%
  echo RC0506_EXIT_CODE=%RC0506_EXIT_CODE%

Do not preload noasar.js or any other external code. RUN_RC0506.cmd clears NODE_OPTIONS
for its child process, records the exact process exit code in the evidence directory and
returns that same code. The manifest-bound harness applies normal-filesystem mode before
authentication.

The harness probes only executables the D-013 native helper itself allows: System32
findstr.exe prints a harness-generated hash-bound local GBK fixture (positive and
128-byte bounded truncation), and System32 ping.exe targets 127.0.0.1 only for the
cooperative cancellation case. No probe accesses an external network. The harness does
not alter PATH, services, registry, network, route or firewall settings and does not
reboot the machine.

Return the complete evidence directory, including rc0506-process-exit-code.txt, both
database evidence files, command transcript, both ZIP dual hashes and the final tasklist
residue snapshot. A harness PASS remains a Windows pre-lease result; the Win7 cases must
be repeated under a new signed RC lease.
