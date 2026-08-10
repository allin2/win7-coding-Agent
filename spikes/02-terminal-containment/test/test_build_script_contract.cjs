#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '../helper/build-win10-kit/build.ps1');
const source = fs.readFileSync(scriptPath, 'utf8');

function violations(text) {
  const found = [];
  const requirePattern = (pattern, code) => {
    if (!pattern.test(text)) found.push(code);
  };
  const rejectPattern = (pattern, code) => {
    if (pattern.test(text)) found.push(code);
  };

  requirePattern(/\$null\s*=\s*\$stdoutTask\.GetAwaiter\(\)\.GetResult\(\)/,
    'STDOUT_TASK_RESULT_NOT_SUPPRESSED');
  requirePattern(/\$null\s*=\s*\$stderrTask\.GetAwaiter\(\)\.GetResult\(\)/,
    'STDERR_TASK_RESULT_NOT_SUPPRESSED');
  rejectPattern(/(?:^|\n)\s*\$(?:stdout|stderr)Task\.GetAwaiter\(\)\.GetResult\(\)/,
    'NAKED_TASK_RESULT');
  requirePattern(/return\s+\[pscustomobject\]\[ordered\]@\{/,
    'CAPTURE_RETURN_NOT_PSCUSTOMOBJECT');
  requirePattern(/if\s*\(\$null\s+-eq\s+\$Items\s+-or\s+\$Items\.Count\s+-ne\s+1\)/,
    'SINGLE_OBJECT_COUNT_GUARD_MISSING');
  requirePattern(/@\("exit_code",\s*"stdout_text",\s*"stderr_text",\s*"stdout_size",\s*"stderr_size"\)/,
    'CAPTURE_REQUIRED_PROPERTY_SET_MISSING');
  requirePattern(/\$capture\.PSObject\.Properties\[\$propertyName\]/,
    'CAPTURE_PROPERTY_LOOKUP_MISSING');
  requirePattern(/\$versionCaptureItems\s*=\s*@\(Invoke-Utf8ProcessBytes/,
    'VERSION_CAPTURE_NOT_MATERIALIZED');
  requirePattern(/Get-ValidatedProcessCapture\s+-Items\s+\$versionCaptureItems/,
    'VERSION_CAPTURE_NOT_VALIDATED');
  requirePattern(/\$smokeCaptureItems\s*=\s*@\(Invoke-Utf8ProcessBytes/,
    'SMOKE_CAPTURE_NOT_MATERIALIZED');
  requirePattern(/Get-ValidatedProcessCapture\s+-Items\s+\$smokeCaptureItems/,
    'SMOKE_CAPTURE_NOT_VALIDATED');
  rejectPattern(/@\(Invoke-Utf8ProcessBytes[\s\S]{0,500}?\)\s*\[-1\]/,
    'CAPTURE_POLLUTION_MASKED_BY_LAST_ITEM');
  requirePattern(/PROCESS_CAPTURE_SELFTEST/, 'CAPTURE_SELFTEST_STAGE_MISSING');
  requirePattern(/expectedCaptureMarker\s*=\s*"D013_"\s*\+\s*\[char\]0x4E2D\s*\+\s*\[char\]0x6587/,
    'NON_ASCII_CAPTURE_MARKER_MISSING');
  requirePattern(/stdout_size\s+-ne\s+11/, 'UTF8_CAPTURE_BYTE_COUNT_GUARD_MISSING');
  requirePattern(/output_object_count\s*=\s*\$captureProbeItems\.Count/,
    'CAPTURE_SELFTEST_OBJECT_COUNT_EVIDENCE_MISSING');
  requirePattern(/process_capture_selftest\s*=\s*\$CaptureStatus/,
    'CAPTURE_SELFTEST_BUILD_RESULT_FIELD_MISSING');

  const writeIndex = text.indexOf('WriteAllBytes($StdoutPath, $stdoutBytes)');
  const decodeIndex = text.indexOf('$stdoutText = $utf8.GetString($stdoutBytes)');
  const parseIndex = text.indexOf('$response = $responseText | ConvertFrom-Json');
  if (writeIndex < 0 || decodeIndex < 0 || parseIndex < 0 ||
      !(writeIndex < decodeIndex && decodeIndex < parseIndex)) {
    found.push('RAW_WRITE_DECODE_PARSE_ORDER_BROKEN');
  }
  return [...new Set(found)];
}

function expectRejected(name, mutated, expectedCode) {
  const result = violations(mutated);
  if (!result.includes(expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${result.join(',') || 'PASS'}`);
  }
}

const current = violations(source);
if (current.length) throw new Error(`current build.ps1 contract failed: ${current.join(', ')}`);

expectRejected(
  'v20 naked stdout GetResult regression',
  source.replace('$null = $stdoutTask.GetAwaiter().GetResult()', '$stdoutTask.GetAwaiter().GetResult()'),
  'STDOUT_TASK_RESULT_NOT_SUPPRESSED');
expectRejected(
  'direct scalar version capture regression',
  source.replace('$versionCaptureItems = @(Invoke-Utf8ProcessBytes', '$versionCaptureItems = Invoke-Utf8ProcessBytes'),
  'VERSION_CAPTURE_NOT_MATERIALIZED');
expectRejected(
  'single-object guard removal regression',
  source.replace('$Items.Count -ne 1', '$Items.Count -lt 1'),
  'SINGLE_OBJECT_COUNT_GUARD_MISSING');
expectRejected(
  'last-item pollution masking regression',
  source.replace(
    '-StdoutPath $versionStdout -StderrPath $versionStderr)',
    '-StdoutPath $versionStdout -StderrPath $versionStderr)[-1]'),
  'CAPTURE_POLLUTION_MASKED_BY_LAST_ITEM');

process.stdout.write('build_script_contract: ALL PASS (current + 4 negative mutations)\n');
