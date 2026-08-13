A7 RC-05 / RC-06 Windows validation kit v2

This kit validates the already locked product ZIP. It does not modify or replace the
product package, and it must not be used to claim full Win10, Win7 or RC PASS.

Required product ZIP SHA-256:
909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5

Run from a normal cmd.exe window after extracting both ZIP files to new local NTFS SSD
directories. Keep the validation kit outside the product root. Evidence and user-data
directories must be absent or empty; never reuse a previous round.

  certutil -hashfile C:\path\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip SHA256
  certutil -hashfile C:\path\RC0506_WINDOWS_VALIDATION_KIT_20260813-v2.zip SHA256
  set ELECTRON_RUN_AS_NODE=1
  C:\product\Win7CodingAgent-0.1.0-rc.1-win7-x64\electron.exe C:\rc0506-kit\RC0506_WINDOWS_VALIDATION.cjs --package-root=C:\product\Win7CodingAgent-0.1.0-rc.1-win7-x64 --evidence=C:\rc0506-evidence --user-data=C:\rc0506-user-data
  set RC0506_EXIT_CODE=%ERRORLEVEL%
  set ELECTRON_RUN_AS_NODE=
  echo RC0506_EXIT_CODE=%RC0506_EXIT_CODE%

Do not set NODE_OPTIONS and do not preload noasar.js or any other external code. The
manifest-bound harness applies the required normal-filesystem mode before authentication.

The harness only uses fixed local Windows system binaries, loopback ping, the packaged
D-013 helper and the packaged D-014 binding. It does not alter PATH, services, registry,
network, route or firewall settings and does not reboot the machine.

Return the complete evidence directory, including both database evidence files, command
transcript, both ZIP dual hashes and the final tasklist residue snapshot. A harness PASS
remains a Windows pre-lease result; the Win7 cases must be repeated under a new signed RC
lease.
