A7 RC-07 / RC-08 Windows lifecycle kit v1

This kit validates upgrade, rollback and uninstall of the already locked product
ZIP. It does not modify the product package bytes, and it must not be used to
claim full Win10, Win7 or RC PASS.

Required product ZIP SHA-256:
39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9

Run from a normal cmd.exe window. Extract the PREVIOUS product ZIP (source
commit f24d9a4, SHA-256
909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5) to a local
NTFS SSD directory - that older install is the upgrade source so the round
proves a real version advance. Keep this kit outside that directory. Use fresh
evidence and user-data directories for the whole matrix; never reuse a
previous round. The harness writes marker files into the user-data root; the
roots must be absent or empty at the start.

RC-07 upgrade matrix (three rounds, one evidence root, fresh user-data per
round is not required - the same root is snapshotted and must stay untouched):

  certutil -hashfile C:\path\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip SHA256
  C:\rc0708-kit\RUN_RC0708_UPGRADE.cmd C:\rc0708\product C:\rc0708\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip C:\rc0708\evidence C:\rc0708\user-data success
  C:\rc0708-kit\RUN_RC0708_UPGRADE.cmd C:\rc0708\product C:\rc0708\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip C:\rc0708\evidence C:\rc0708\user-data corrupt-staged-file
  C:\rc0708-kit\RUN_RC0708_UPGRADE.cmd C:\rc0708\product C:\rc0708\Win7CodingAgent-0.1.0-rc.1-win7-x64.zip C:\rc0708\evidence C:\rc0708\user-data activation-corruption

  Round "success" upgrades the installed tree to the locked candidate and
  proves activation plus zero residue. Round "corrupt-staged-file" damages one
  staged file and proves detection before activation. Round
  "activation-corruption" damages the activated tree and proves rollback to a
  byte-identical original. Rounds 2 and 3 expect the previous round to have
  left a coherent verified install in place.

RC-08 uninstall matrix (two rounds; re-extract the product ZIP to a fresh
product directory before the purge round):

  C:\rc0708-kit\RUN_RC0708_UNINSTALL.cmd C:\rc0708\product C:\rc0708\user-data C:\rc0708\evidence retain
  :: re-extract the product ZIP to C:\rc0708\product2 first, then:
  C:\rc0708-kit\RUN_RC0708_UNINSTALL.cmd C:\rc0708\product2 C:\rc0708\user-data2 C:\rc0708\evidence purge

The product must not be running: the harness verifies zero electron/helper
processes and probes the electron.exe file lock before anything is renamed.
Directory renames between harness phases are performed by the .cmd wrapper
because the harness itself runs from the product's electron.exe. Nothing in
this kit touches the network, PATH, services, registry or system
configuration, and it never reboots or downloads anything.

Return the complete evidence directory, including every
rc0708-*-exit-code-*.txt and rc0708-*-transcript-*.txt file. A harness PASS
remains a Windows pre-lease result; the lifecycle cases must be repeated under
a new signed RC lease on Win7.
