# A9-30 v26 r4 independent kit and desktop-entry review

PASS, P0=0/P1=0/P2=0. Reviewer `/root/a9_30_native_kit_review`; implementation author `/root`; reviewed_at `2026-10-02T01:32:41+08:00`.

- Source: `8e2bcfc38b03813f2cfa34ec17e60c89e23f68ff`, parent `0a96eb396241fa5f03aa67e085a22e756cdfae1a`.
- ZIP: `A9_30_V26_BUILDKIT_r4.zip`, 88092 bytes, 23 unique files.
- ZIP SHA-256: `f7157f71da3ea91d09ef5891344d5ba7a6850c3207e52e231cdd425c54fbc296`.
- Input-lock SHA-256: `141fcbd6d406342a3a4187f4b8b2dc0bd6b3c8fd063b2deb64d5bc2856e37356`.
- Manifest SHA-256: `ed625fe9e5be83fcc3d999c93320ec5b71dc24e31079dae7232db9693250538f`.

All 13 native source files match the committed blobs, sizes and hashes. Compared with r3, only helper.cpp and source binding metadata changed; build templates, Profile, protocol and stream writer did not drift. The ACL repair preserves the captured protection mode and strict comparison, as independently reviewed in the [first-failure report](a9_30_r3_win10_first_build_failure_2026-10-02.md).

Profile remains WIN10-VS2019-V142-SDK19041-D013-V26-STREAMING-X64. The actual token elevation, Medium RID 8192, ordinary-user and no-Host-Job gates remain mandatory; v1/v2/v3 smoke and PE/API/static CRT checks remain in the offline kit.

The fixed r4 desktop controller uses new r4 request/result/ready/log names, the two approved build-r4-a/build-r4-b directories and the exact r4 ZIP hash. Before any build script invocation it verifies all 23 extracted files. Its entry requires a9builder in a real desktop session; failed Probe or BuildA prevents BuildB. Control script evidence remains under `.acceptance/a9-30-developer/closeout/control-scripts/`.

The owner approved this new source commit, two fresh directories and their a9builder Modify grants, and r4 double builds. This review permits kit registration under the separately authorized local registration workflow. It does not prove execution identity, native double builds, returned-evidence approval, product relock, Electron or Win7 PASS; all those checks remain pending at review time. No push or merge is authorized.
