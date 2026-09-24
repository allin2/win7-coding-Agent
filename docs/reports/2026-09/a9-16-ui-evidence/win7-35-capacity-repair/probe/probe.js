/**
 * Replayable real-layout geometry probe for A9-16 U02/U07 (WIN7-35 capacity gate).
 *
 * Contract:
 * - Measures ACTUAL window.innerWidth / innerHeight / devicePixelRatio / screen*.
 * - Target content viewport is 1079x540 CSS px (Win7 1366x768 @ 125% maximized usable).
 * - If actual height is 584 (policy minHeight clamp) or otherwise not 540,
 *   status is INVALID_* and capacity is NOT claimed PASS.
 * - Records list clientHeight, group heads, note height, row heights, fully visible rows.
 * - Stop / archive visibility requires a real border-box intersection with the actual
 *   viewport (not merely non-zero height). No diagnostic overlay covers the rail.
 *
 * Layout negative (WIN7-35 selector-miss failure mode):
 *   index.html?simulate=selector-miss
 *
 * Replay gate (non-zero on any assertion mismatch):
 *   node docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/verify-geometry-probe.mjs
 */
(function () {
  'use strict';

  var TARGET = { width: 1079, height: 540 };
  var CLAMPED_HEIGHT = 584;
  var MIN_VISIBLE_ROWS = 4;
  var ROW_HEIGHT = 36;

  function box(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    };
  }

  function viewportHit(node) {
    if (!node || node.hidden) {
      return { intersects: false, fully_in_viewport: false, box: null };
    }
    var r = node.getBoundingClientRect();
    var b = box(node);
    if (!b || r.width <= 0 || r.height <= 0) {
      return { intersects: false, fully_in_viewport: false, box: b };
    }
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var intersects = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    var fully = r.top >= -0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5;
    return { intersects: intersects, fully_in_viewport: fully, box: b };
  }

  function applySelectorMissSimulation() {
    // Reproduce WIN7-35 failure mode in real layout: layout selectors do not bind,
    // so the <p> falls back to UA default margins + body line-height (~44px footprint).
    var note = document.getElementById('conversation-directory-note');
    if (!note) return;
    note.className = 'quiet';
    note.style.margin = '1em 0';
    note.style.padding = '0';
    note.style.borderTop = '0';
    note.style.flex = '0 1 auto';
    note.style.fontSize = '12px';
    note.style.lineHeight = '1.55';
    note.style.whiteSpace = 'normal';
    note.style.overflow = 'visible';
    note.style.textOverflow = 'clip';
  }

  function measure() {
    var de = document.documentElement;
    var list = document.getElementById('conversation-list');
    var note = document.getElementById('conversation-directory-note');
    var archive = document.getElementById('conversation-archive-section');
    var railStop = document.getElementById('rail-stop');
    var rows = list ? Array.prototype.slice.call(list.querySelectorAll('li > button')) : [];
    var lr = list ? list.getBoundingClientRect() : null;
    var visible = [];
    var i;
    if (lr) {
      for (i = 0; i < rows.length; i += 1) {
        var r = rows[i].getBoundingClientRect();
        if (r.height > 0 && r.top >= lr.top - 0.5 && r.bottom <= lr.bottom + 0.5) {
          visible.push(rows[i]);
        }
      }
    }
    var heads = list
      ? Array.prototype.slice.call(list.querySelectorAll('.conversation-group-head')).map(function (h) {
          return {
            text: String(h.textContent || '').replace(/\s+/g, ' ').trim(),
            height: Math.round(h.getBoundingClientRect().height),
          };
        })
      : [];
    var noteStyle = note ? window.getComputedStyle(note) : null;
    var noteBox = box(note);
    var stopHit = viewportHit(railStop);
    var archiveHit = viewportHit(archive);
    var workbenchBox = box(document.querySelector('.workbench'));
    // Layout must start at the viewport origin; any diagnostic spacer shifts chrome.
    var workbenchOriginOk = Boolean(
      workbenchBox &&
      Math.abs(workbenchBox.x) <= 0.5 &&
      Math.abs(workbenchBox.y) <= 0.5,
    );

    return {
      schema_version: 1,
      kind: 'A9_16_REAL_GEOMETRY_PROBE',
      recorded_at: new Date().toISOString(),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
        screen_width: window.screen ? window.screen.width : null,
        screen_height: window.screen ? window.screen.height : null,
        screen_avail_width: window.screen ? window.screen.availWidth : null,
        screen_avail_height: window.screen ? window.screen.availHeight : null,
        doc_client_width: de.clientWidth,
        doc_client_height: de.clientHeight,
        doc_scroll_width: de.scrollWidth,
        doc_scroll_height: de.scrollHeight,
      },
      target: {
        width: TARGET.width,
        height: TARGET.height,
        clamped_height: CLAMPED_HEIGHT,
        min_visible_rows: MIN_VISIBLE_ROWS,
        row_height: ROW_HEIGHT,
      },
      fixture: {
        conversation_rows: rows.length,
        group_header_count: heads.length,
        archive_summary: archiveHit,
        stop_control: stopHit,
        // Reachability claim requires intersection AND full box inside the actual viewport.
        archive_summary_in_viewport: Boolean(archiveHit.intersects && archiveHit.fully_in_viewport),
        stop_in_viewport: Boolean(stopHit.intersects && stopHit.fully_in_viewport),
      },
      geometry: {
        list_client_height: list ? list.clientHeight : null,
        list_scroll_height: list ? list.scrollHeight : null,
        list_client_width: list ? list.clientWidth : null,
        list_scroll_width: list ? list.scrollWidth : null,
        list_box: box(list),
        workbench_box: workbenchBox,
        workbench_origin_ok: workbenchOriginOk,
        directory_box: box(document.querySelector('.conversation-directory')),
        note_box: noteBox,
        note_style: noteStyle
          ? {
              font_size: noteStyle.fontSize,
              line_height: noteStyle.lineHeight,
              margin_top: noteStyle.marginTop,
              margin_bottom: noteStyle.marginBottom,
              white_space: noteStyle.whiteSpace,
              overflow: noteStyle.overflow,
            }
          : null,
        group_headers: heads,
        row_heights: rows.map(function (b) {
          return Math.round(b.getBoundingClientRect().height);
        }),
        fully_visible_rows: visible.length,
        horizontal_overflow_px: Math.max(0, de.scrollWidth - de.clientWidth),
        vertical_overflow_px: Math.max(0, de.scrollHeight - de.clientHeight),
      },
    };
  }

  function evaluate(m) {
    var vw = m.viewport.innerWidth;
    var vh = m.viewport.innerHeight;
    var rows = m.geometry.fully_visible_rows;
    var rowHeights = m.geometry.row_heights;
    var singleRowHeight = rowHeights.length > 0 && rowHeights.every(function (h) { return h === ROW_HEIGHT; });
    var reasons = [];

    if (vh === CLAMPED_HEIGHT) {
      return {
        status: 'INVALID_VIEWPORT_CLAMPED_584',
        capacity_pass: false,
        reasons: [
          'Actual innerHeight is 584 (minimum-window clamp). ' +
            'This is larger than the physical usable 540 CSS px viewport and must not count as capacity PASS.',
        ],
      };
    }
    if (vw !== TARGET.width || vh !== TARGET.height) {
      reasons.push(
        'Actual viewport ' + vw + 'x' + vh + ' != target ' + TARGET.width + 'x' + TARGET.height + '.',
      );
      return {
        status: 'INVALID_VIEWPORT_UNEXPECTED',
        capacity_pass: false,
        reasons: reasons,
      };
    }
    if (!m.geometry.workbench_origin_ok) {
      reasons.push(
        'workbench box origin is ' +
          JSON.stringify(m.geometry.workbench_box) +
          ' but measurement requires (0,0); diagnostic spacers are not allowed.',
      );
    }
    if (!m.fixture.archive_summary_in_viewport) {
      reasons.push('Archive summary border-box is not fully inside the actual viewport (intersection/reachability).');
    }
    if (!m.fixture.stop_in_viewport) {
      reasons.push('Stop control border-box is not fully inside the actual viewport (intersection/reachability).');
    }
    if (m.fixture.group_header_count < 2) {
      reasons.push('Expected two activity group headers.');
    }
    if (!singleRowHeight) {
      reasons.push('Row heights are not all ' + ROW_HEIGHT + 'px: ' + JSON.stringify(rowHeights));
    }
    if (rows < MIN_VISIBLE_ROWS) {
      reasons.push('Fully visible rows ' + rows + ' < ' + MIN_VISIBLE_ROWS + ' (list clientHeight ' + m.geometry.list_client_height + ').');
    }
    if (m.geometry.horizontal_overflow_px > 0) {
      reasons.push('Horizontal overflow ' + m.geometry.horizontal_overflow_px + 'px.');
    }

    if (reasons.length) {
      return { status: 'FAIL_CAPACITY', capacity_pass: false, reasons: reasons };
    }
    return {
      status: 'PASS_DEV_GEOMETRY_NOT_WIN7',
      capacity_pass: true,
      reasons: [
        'Dev-machine real layout at ' + TARGET.width + 'x' + TARGET.height +
          ' shows ' + rows + ' fully visible ' + ROW_HEIGHT + 'px rows in the worst form; ' +
          'Stop and archive summary border-boxes are fully inside the actual viewport. ' +
          'This is not Win7 evidence.',
      ],
    };
  }

  function render(result) {
    var out = document.getElementById('probe-result');
    if (out) {
      out.textContent = JSON.stringify(result, null, 2);
    }
    window.__A9_GEOMETRY_PROBE__ = result;
    return result;
  }

  function run() {
    var simulate = /[?&]simulate=selector-miss/.test(String(window.location.search || ''));
    if (simulate) {
      applySelectorMissSimulation();
    }
    var measurement = measure();
    measurement.simulate = simulate ? 'selector-miss' : null;
    var verdict = evaluate(measurement);
    var result = {
      schema_version: 1,
      kind: 'A9_16_REAL_GEOMETRY_PROBE_RESULT',
      status: verdict.status,
      capacity_pass: verdict.capacity_pass,
      reasons: verdict.reasons,
      measurement: measurement,
    };
    return render(result);
  }

  window.a9GeometryProbeRun = run;
  document.addEventListener('a9-probe-remeasure', function () {
    run();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      run();
    });
  } else {
    run();
  }
})();
