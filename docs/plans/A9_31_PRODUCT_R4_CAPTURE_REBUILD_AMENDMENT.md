# A9-31：r4 Win10重验修订——新根R2同源重编取证组件并换绑其构建批准

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求批准对[r4包与Win10重验材料](A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md)
（已批准，SHA256 `f784fa4a226ccc8393a71a94f481e59fc2a86349b2114308730996ed27dd06a8`，ADR-0186）的有限修订；C1结果、C3流程及D1–D3不变。未在Win7实机验证。

## 1. 依据

R1根（`A9-A31-Product-R4-20261006-R1`）准入在files-scope停止：`INTEGRITY_CAPTURE_BUILD_FAILED`。控制器`Capture-Build`要求取证组件构建记录的
`source`等于当前source，`Capture-BuildApproval`要求原构建批准记录source相同，并写死r3的合同`37cd8d4b…`、`ADR-0168`与构建批准`dd64e5bf…`。
继承的组件（DLL `93f1979a…`，MVID `29314b2e…`，构建记录`09fe18f9…`）为r3在`ebda911`下编译。改写构建记录的source等同伪造来源，不采用；
改控制器校验逻辑超出“只换绑定”。

## 2. 修订（仅此）

1. **新根**：远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R4-20261006-R2`，本地工具根`.acceptance/a9-31-developer/product-r4-win10-r2/`。
   四个输入自R1根复制并逐SHA校验（新包ZIP已在R1校验）。R1根与本地`product-r4-win10-r1/`原样保留、不再使用、不删除。
2. **同源重编取证组件**：在R2用现有`stage-product-r3.ps1 -PrepareCapture -CompileRunId <32位十六进制>`机制编译（r3首根即用此机制）：同一C#源
   （19,439字节，SHA256 `dbc85763…`）、同一编译器（csc `aae1db57…`）与三个参考程序集（摘要`7a6ae1f2…`）、同一API/运行档案；产出新DLL/MVID与绑定`8d207ab`的构建记录。
   不改C#源、编译参数或任何取证判据。
3. **构建批准记录**：R2的`scope-approval.json`采用r3同款八字段格式（`schema_version`、`status`、`source`=`8d207ab…`、`contract_sha256`=本修订SHA256、`approved_at`、
   `response`=“批准”、`approved_contract_sections`=“C1-C3”、`decision`=“ADR-0187”），同时作为取证组件构建批准记录`capture-build-scope-approval.json`。
4. **换绑表扩展**：除ADR-0186已列绑定外，另把r3取证构建批准常量（合同`37cd8d4b…`→本修订SHA256、`ADR-0168`→`ADR-0187`、`dd64e5bf…`→新批准记录SHA256）
   与旧组件绑定（DLL SHA/大小、MVID、构建记录SHA）换为R2实际值。所有派生文件仍须反向换绑后与R9逐字相同。
5. **顺序**：先由R9派生stage脚本（不含组件绑定）并部署→在R2编译取证组件并取回构建记录与DLL（逐SHA）→再派生serve/launch/driver、master、四个revision与准入输入→
   准入全套（含新增包内Policy检查）在R2全部重新执行→冻结→C3（不变）。R1中已通过的检查不继承。

## 3. 边界与C14

不改产品/native/锁、取证源与判据、控制器/driver功能逻辑、观察器判据、限时；不删除R1或任何旧根；不推送/合并/发布；Win7、独立验收、DEVELOPER_VERIFIED不在内。
批准后、实施前在任务书逐一登记`product-r4-win10-r2/`下的准确新增路径（结构同R1，另加取证组件编译与取回记录）并追加ADR-0187。批准须按本稿SHA256绑定。

## 4. 待负责人确认

- D1：用新根R2重做准入（推荐，R1已跑检查与组件绑定不一致，不在其上续做）。
- D2：取证组件构建批准记录的`contract_sha256`取本修订SHA256（推荐，本修订是授权重编的文件）。
