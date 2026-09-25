'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 1) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});
const pct = (value, digits = 1) => value == null ? '—' : `${fmt(value * 100, digits)}%`;
const count = (value) => Number(value).toLocaleString('en-US');
const htmlEntities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
const esc = (value) => String(value).replace(/[&<>"']/g, c => htmlEntities[c]);
const human = (value) => String(value).replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const colors = {
  green: '#1b6a62',
  gold: '#d7a460',
  rust: '#bc6956',
  gray: '#abb6a5'
};
let data, lower, upper, scoreVersion = 0,
  labVersion = 0,
  labTimer;
const presets = {
  lower: {
    revenue: 95000,
    loan_amnt: 8000,
    dti_n: 9,
    fico_n: 777,
    emp_length: '10+ years',
    purpose: 'debt_consolidation'
  },
  typical: {
    revenue: 65000,
    loan_amnt: 12000,
    dti_n: 18,
    fico_n: 702,
    emp_length: '3 years',
    purpose: 'debt_consolidation'
  },
  higher: {
    revenue: 38000,
    loan_amnt: 24000,
    dti_n: 32,
    fico_n: 662,
    emp_length: '1 year',
    purpose: 'small_business'
  }
};

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The calculation could not finish. Please try again.');
  return result;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function chartFrame(title, maxX = 1, maxY = 1, xTitle = '', yTitle = '') {
  const width = 520,
    height = 267,
    left = 49,
    right = 15,
    top = 17,
    bottom = 45;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const x = value => left + value / maxX * plotWidth;
  const y = value => top + plotHeight - value / maxY * plotHeight;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>`;
  const tick = v => `${fmt(v*100,Math.abs(v*100-Math.round(v*100))>1e-6?1:0)}%`;
  for (let i = 0; i <= 4; i++) {
    const value = maxY * i / 4;
    svg += `<line class="gridline" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${tick(value)}</text>`;
  }
  if (xTitle) {
    for (let i = 0; i <= 4; i++) svg += `<text x="${x(maxX*i/4)}" y="${height-bottom+21}" text-anchor="middle">${tick(maxX*i/4)}</text>`;
    svg += `<text class="axis-title" x="${left+plotWidth/2}" y="${height-3}" text-anchor="middle">${esc(xTitle)}</text>`;
  }
  if (yTitle) svg += `<text class="axis-title" x="12" y="${top+plotHeight/2}" transform="rotate(-90 12 ${top+plotHeight/2})" text-anchor="middle">${esc(yTitle)}</text>`;
  return {
    svg,
    x,
    y,
    width,
    height,
    left,
    plotWidth,
    plotHeight
  };
}

function drawROC() {
  const split = $('roc-split').value;
  const chart = chartFrame(`${split === 'test' ? 'Final-test' : 'Validation'} ROC curves`, 1, 1, 'False-positive rate', 'True-positive rate');
  let svg = chart.svg + `<line x1="${chart.x(0)}" y1="${chart.y(0)}" x2="${chart.x(1)}" y2="${chart.y(1)}" stroke="${colors.gray}" stroke-dasharray="5 5"/>`;
  const curves = split === 'test' ? {
    [data.selected_model]: data.roc.test
  } : data.roc.validation;
  let legend = [];
  Object.entries(curves).forEach(([name, points], i) => {
    const color = i === 0 ? colors.green : colors.gold;
    const line = points.map((point, j) => `${j?'L':'M'}${chart.x(point.x).toFixed(2)},${chart.y(point.y).toFixed(2)}`).join(' ');
    svg += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const metric = data.metrics.find(m => m.model === name && m.split === (split === 'test' ? 'Final test' : 'Validation'));
    legend.push(`<span><i style="--legend:${color}"></i>${esc(name.replace(' (depth 3)',''))} · ${fmt(metric.roc_auc,3)}</span>`);
  });
  $('roc-chart').innerHTML = svg + '</svg>';
  $('roc-legend').innerHTML = legend.join('');
}

function drawBands() {
  const max = Math.max(...data.validation_bands.map(b => b.observed_rate), ...data.test_bands.map(b => b.observed_rate));
  const ceiling = Math.ceil((max + .03) * 10) / 10;
  const c = chartFrame('Observed charged-off rates by score band, validation and final test', 1, ceiling, '', 'Charged-off rate');
  let svg = c.svg;
  data.test_bands.forEach((band, i) => {
    const center = c.left + c.plotWidth * (i + .5) / 3;
    const barWidth = 32,
      gap = 6;
    [data.validation_bands[i], band].forEach((b, j) => {
      const x = center + (j === 0 ? -barWidth - gap / 2 : gap / 2);
      const y = c.y(b.observed_rate),
        h = c.y(0) - y;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="3" fill="${j===0?colors.green:colors.gold}"><title>${j===0?'Validation':'Final test'} ${esc(b.band)}: ${pct(b.observed_rate,2)} (${count(b.loans)} loans)</title></rect>`;
      svg += `<text x="${x+barWidth/2}" y="${y-8}" text-anchor="middle" style="font-size:10px;fill:${j===0?colors.green:'#a78046'}">${pct(b.observed_rate)}</text>`;
    });
    svg += `<text x="${center}" y="${c.height-23}" text-anchor="middle">${esc(band.band)} score</text>`;
  });
  $('bands-chart').innerHTML = svg + '</svg>';
}

function drawCalibration() {
  const max = Math.max(...data.calibration.flatMap(p => [p.mean_score, p.observed_rate]));
  const ceiling = Math.max(.5, Math.ceil(max * 10) / 10);
  const c = chartFrame('Final-test average score versus observed charged-off rate in ten score groups', ceiling, ceiling, 'Mean model score', 'Observed outcome rate');
  let svg = c.svg + `<line x1="${c.x(0)}" y1="${c.y(0)}" x2="${c.x(ceiling)}" y2="${c.y(ceiling)}" stroke="${colors.gray}" stroke-dasharray="5 5"/>`;
  const points = data.calibration.map(p => `${c.x(p.mean_score)},${c.y(p.observed_rate)}`).join(' ');
  svg += `<polyline points="${points}" stroke="${colors.gold}" stroke-width="1.5" fill="none" opacity=".6"/>`;
  data.calibration.forEach(p => {
    svg += `<circle cx="${c.x(p.mean_score)}" cy="${c.y(p.observed_rate)}" r="4.7" fill="${colors.gold}" stroke="white" stroke-width="1.5"><title>Score ${pct(p.mean_score,2)}; observed ${pct(p.observed_rate,2)}; ${count(p.loans)} loans</title></circle>`;
  });
  $('calibration-chart').innerHTML = svg + '</svg>';
}

function renderOverview() {
  const final = data.metrics.find(m => m.split === 'Final test');
  const gap = (final.prevalence - data.test_mean_score) * 100;
  const metrics = [
    ['ROC-AUC', fmt(final.roc_auc, 3), 'Ranking quality · 0.5 random, 1.0 perfect'],
    ['Average precision', fmt(final.average_precision, 3), `Random-ranking reference: ${fmt(final.prevalence,3)}`],
    ['Probability gap', `${fmt(Math.abs(gap))}<span class="suffix">pp</span>`, `${gap>=0?'Understates':'Overstates'} the observed outcome rate`],
    ['Later loans tested', count(final.n), '2017–2018 · original held-out cohorts']
  ];
  $('headline-metrics').innerHTML = metrics.map(([label, value, detail]) => `<article class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-detail">${detail}</p></article>`).join('');
  $('verdict-copy').textContent = `Charged-off rates rise from ${pct(data.test_bands[0].observed_rate)} in the low-score group to ${pct(data.test_bands[2].observed_rate)} in the high-score group. Scores still understate observed outcomes.`;
  $('model-table').innerHTML = table(['Model', 'Validation ROC-AUC', 'Final-test ROC-AUC', 'Selection'], Object.entries(data.roc.validation).map(([name]) => {
    const v = data.metrics.find(m => m.model === name && m.split === 'Validation');
    const winner = name === data.selected_model;
    return [`<strong>${esc(name)}</strong>`, fmt(v.roc_auc, 4), winner ? `<span class="strong-number">${fmt(final.roc_auc,4)}</span>` : '<span class="faint">Not evaluated</span>', winner ? '<span class="selected-badge">Selected on validation</span>' : '<span class="faint">Lower validation AUC</span>'];
  }));
  const details = [
    ['Average precision', `How well charged-off loans rank near the top. Compare with the ${pct(final.prevalence)} charged-off share; higher is better.`, fmt(final.average_precision, 3)],
    ['Brier score', `Mean squared score error; lower is better. Constant training-rate reference: ${fmt(data.baseline_brier,3)}.`, fmt(final.brier, 3)],
    ['Mean score vs. outcome rate', `The model averages ${pct(data.test_mean_score)}; ${pct(final.prevalence)} of the test loans were charged off.`, `${fmt(Math.abs(gap))} pp`]
  ];
  $('metric-details').innerHTML = details.map(([title, copy, value]) => `<div class="metric-explainer"><strong>${title}</strong><p>${copy}</p><span class="value">${value}</span></div>`).join('');
  drawROC();
  drawBands();
  drawCalibration();
}

function renderData() {
  $('split-table').innerHTML = table(['Cohort', 'Loans', 'Dates', 'Charged off'], data.splits.map(s => [esc(s.split), count(s.rows), `${s.start} → ${s.end}`, pct(s.charged_off_rate, 2)]));
  const findings = [
    [`${data.checks_passed} routing checks passed`, 'Includes exact cutoffs, neighboring values and missing-input cases.'],
    ['No duplicate source loan IDs', `${count(data.source_rows)} source records; ${count(data.sample_size)} sampled without replacement.`],
    ['Both SQL queries reconcile', 'Year and purpose counts agree with the Python sample.'],
    [`${count(data.employment_missing)} coded missing employment values`, 'The NI category becomes Unknown in the fitted pipeline.'],
    [`${data.extremes.income_above_1m} very high incomes · ${data.extremes.dti_above_100} high DTI values`, 'Income above $1m and DTI above 100 retained and documented.']
  ];
  $('audit-findings').innerHTML = findings.map(([title, copy]) => `<div class="audit-row"><span class="audit-check" aria-hidden="true">✓</span><div>${title}<p>${copy}</p></div></div>`).join('');
  $('purpose-table').innerHTML = table(['Purpose', 'Loans', 'Charged-off loans', 'Observed rate'], data.by_purpose.map(p => [esc(human(p.purpose)), count(p.loan_count), count(p.charged_off_count), pct(p.charged_off_rate, 2)]));
  $('provenance').innerHTML = `<p>Source: Ariza-Garzón, Sanz-Guerrero, Arroyo Gallardo and Lending Club (2024), granting-model dataset v0.1.</p><p>Sample seed: ${data.seed}. Source MD5: ${esc(data.source_md5)}.</p><p>Sample ID SHA-256: ${esc(data.sample_sha256)}.</p><p>Results exported from the executed notebook. Extra diagnostic metrics use the chosen model's final-test predictions. Threshold experiments use validation data only.</p>`;
}

function populateForm() {
  const employment = ['< 1 year', '1 year', ...Array.from({
    length: 8
  }, (_, i) => `${i+2} years`), '10+ years'];
  $('emp_length').innerHTML = '<option value="">Unknown</option>' + employment.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  $('purpose').innerHTML = '<option value="">Unknown</option>' + data.categories.purpose.map(v => `<option value="${esc(v)}">${esc(human(v))}</option>`).join('');
  setPreset('typical', false);
}

function setPreset(name, submit = true) {
  Object.entries(presets[name]).forEach(([key, value]) => {
    $(key).value = value;
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.classList.toggle('selected', button.dataset.preset === name));
  if (submit) scoreLoan(true);
}

function renderScore(result) {
  $('score-results').classList.remove('stale');
  $('score-status').hidden = true;
  const notices = result.notices.length ? `<div class="notices">${result.notices.map(n=>`<p>${esc(n)}</p>`).join('')}</div>` : '';
  if (result.score === null) {
    $('score-results').innerHTML = `<article class="panel result-panel"><div class="result-top"><h2>Manual review</h2><span class="decision-badge review">Review</span></div><p class="score-value">—</p><p class="score-caption">No score calculated</p><div class="note"><strong>More information is needed.</strong><p>${esc(result.reason)}</p></div><p class="chart-note">An essential numeric input is missing or invalid, so the model did not score this example.</p></article>`;
    return;
  }
  const [low, high] = data.cutoffs;
  const maxContribution = Math.max(...result.contributions.map(c => Math.abs(c.value)), .001);
  const contributions = result.contributions.map(c => {
    const w = Math.abs(c.value) / maxContribution * 48;
    const left = c.value < 0 ? 50 - w : 50;
    return `<div class="contribution-row"><span>${esc(c.feature)}</span><div class="contribution-track"><span class="contribution-bar" style="left:${left}%;width:${w}%;background:${c.value<0?colors.green:colors.rust}"></span></div><span class="contribution-value">${c.value>0?'+':''}${fmt(c.value,2)}</span></div>`;
  }).join('');
  $('score-results').innerHTML = `<article class="panel result-panel"><div class="result-top"><h2>Model response</h2><span class="decision-badge ${result.decision}">${result.decision}</span></div><p class="score-value">${fmt(result.score*100,1)}<small>%</small></p><p class="score-caption">Model score · not a one-year default probability</p><div class="gauge" aria-label="Score ${pct(result.score)}; lower cutoff ${pct(low,2)}, upper cutoff ${pct(high,2)}"><span class="gauge-segment" style="width:${low*100}%;background:${colors.green}"></span><span class="gauge-segment" style="width:${(high-low)*100}%;background:${colors.gold}"></span><span class="gauge-segment" style="width:${(1-high)*100}%;background:${colors.rust}"></span><span class="gauge-marker" style="left:${result.score*100}%"></span></div><div class="gauge-labels"><span>0%</span><span>100%</span></div><p class="boundary-copy">Approve below ${pct(low,2)} · Review below ${pct(high,2)} · Decline at or above ${pct(high,2)}</p><div class="historical-context"><strong>Historical context for this score group</strong><p><strong>${pct(result.band.observed_rate)}</strong> of the ${count(result.band.loans)} final-test loans in the ${esc(result.band.band.toLowerCase())}-score group were charged off. That is a group outcome rate, not a prediction for this individual.</p></div>${notices}</article><article class="panel"><div class="panel-heading"><div><h2>What is moving this score?</h2><p>Contributions in the fitted logistic model.</p></div></div>${contributions}<div class="legend"><span><i style="--legend:${colors.green}"></i>Lowers log-odds</span><span><i style="--legend:${colors.rust}"></i>Raises log-odds</span></div><p class="chart-note">Contributions add to the intercept (${fmt(result.intercept,2)}) on the log-odds scale, not in percentage points. They describe model associations, not causal effects.</p></article>`;
}

async function scoreLoan(reveal = false) {
  const version = ++scoreVersion;
  $('score-error').hidden = true;
  $('score-button').disabled = true;
  $('score-button').textContent = 'Calculating…';
  const payload = {};
  ['revenue', 'loan_amnt', 'dti_n', 'fico_n'].forEach(key => {
    const value = $(key).value.trim();
    payload[key] = value === '' ? null : Number(value);
  });
  ['emp_length', 'purpose'].forEach(key => {
    payload[key] = $(key).value || null;
  });
  try {
    const result = await api('/api/score', payload);
    if (version === scoreVersion) {
      renderScore(result);
      if (reveal && window.matchMedia('(max-width:820px)').matches) {
        $('score-results').scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    }
  } catch (error) {
    if (version === scoreVersion) {
      $('score-error').textContent = error.message;
      $('score-error').hidden = false;
    }
  } finally {
    if (version === scoreVersion) {
      $('score-button').disabled = false;
      $('score-button').innerHTML = 'Score this loan <span aria-hidden="true">→</span>';
    }
  }
}

function syncCutoffs() {
  $('lower-cutoff').value = lower * 100;
  $('upper-cutoff').value = upper * 100;
  $('lower-value').value = (lower * 100).toFixed(2);
  $('upper-value').value = (upper * 100).toFixed(2);
  $('cutoff-status').textContent = lower === data.cutoffs[0] && upper === data.cutoffs[1] ? 'Original cutoffs restored at full precision.' : 'Exploratory settings · original report and loan scorer unchanged.';
}

function changeCutoff(which, raw) {
  if (raw === '') return;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    $('lab-error').textContent = 'Use a score cutoff between 0 and 100%.';
    $('lab-error').hidden = false;
    return;
  }
  if (which === 'lower') lower = n / 100;
  else upper = n / 100;
  syncCutoffs();
  clearTimeout(labTimer);
  labTimer = setTimeout(updateLab, 100);
}

async function updateLab() {
  const version = ++labVersion;
  if (!(lower < upper)) {
    $('lab-error').textContent = 'Set the lower cutoff below the upper cutoff. Results below keep the last valid settings.';
    $('lab-error').hidden = false;
    return;
  }
  $('lab-error').hidden = true;
  try {
    const result = await api('/api/validation-routes', {
      lower,
      upper
    });
    if (version !== labVersion) return;
    $('lab-subtitle').textContent = `${count(result.n)} validation loans · approve below ${pct(lower,2)}, decline from ${pct(upper,2)}`;
    $('routing-stack').innerHTML = result.rows.map((r, i) => `<div style="width:${r.share*100}%;background:${[colors.green,colors.gold,colors.rust][i]}" title="${human(r.decision)}: ${count(r.loans)} loans">${r.share>.09?pct(r.share,0):''}</div>`).join('');
    $('routing-table').innerHTML = table(['Route', 'Loans', 'Share', 'Charged-off rate'], result.rows.map(r => [`<span class="decision-badge ${r.decision}">${r.decision}</span>`, count(r.loans), pct(r.share), pct(r.observed_rate, 2)]));
    $('routing-insights').innerHTML = `<div><div class="big">${pct(result.rows[1].share)}</div><p>Routed to manual review</p></div><div><div class="big">${pct(result.charged_off_capture)}</div><p>Of all charged-off validation loans routed to decline</p></div>`;
  } catch (error) {
    if (version === labVersion) {
      $('lab-error').textContent = error.message;
      $('lab-error').hidden = false;
    }
  }
}

function navigate() {
  if (!data) return;
  const requested = location.hash.slice(1) || 'overview';
  const selected = ['overview', 'score', 'decisions', 'data'].includes(requested) ? requested : 'overview';
  document.querySelectorAll('.page').forEach(section => {
    section.hidden = section.id !== selected;
  });
  document.querySelectorAll('[data-page]').forEach(link => {
    const active = link.dataset.page === selected;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${{overview:'Model performance',score:'Try a loan',decisions:'Decisions lab',data:'Data & method'}[selected]} · Loan Risk`;
}

async function start() {
  try {
    data = await api('/api/summary');
    renderOverview();
    renderData();
    populateForm();
    [lower, upper] = data.cutoffs;
    syncCutoffs();
    $('loading').hidden = true;
    navigate();
    await Promise.all([scoreLoan(), updateLab()]);
  } catch (error) {
    $('loading').hidden = true;
    $('fatal').hidden = false;
    $('fatal').textContent = `The analysis could not load. ${error.message} Close this page and double-click Start Loan Risk.cmd to restart.`;
  }
}

window.addEventListener('hashchange', navigate);
$('roc-split').addEventListener('change', drawROC);
$('loan-form').addEventListener('submit', event => {
  event.preventDefault();
  scoreLoan(true);
});
$('loan-form').addEventListener('input', () => {
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('selected'));
  $('score-results').classList.add('stale');
  $('score-status').hidden = false;
});
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.preset)));
['lower', 'upper'].forEach(which => {
  $(`${which}-cutoff`).addEventListener('input', event => changeCutoff(which, event.target.value));
  $(`${which}-value`).addEventListener('change', event => changeCutoff(which, event.target.value));
});
$('reset-cutoffs').addEventListener('click', () => {
  [lower, upper] = data.cutoffs;
  syncCutoffs();
  updateLab();
});
$('apply-cutoffs').addEventListener('click', () => {
  const low = $('lower-value').value,
    high = $('upper-value').value;
  if (low === '' || high === '' || !Number.isFinite(Number(low)) || !Number.isFinite(Number(high)) || Number(low) < 0 || Number(high) > 100) {
    $('lab-error').textContent = 'Enter both cutoffs between 0 and 100%.';
    $('lab-error').hidden = false;
    return;
  }
  [lower, upper] = [Number(low) / 100, Number(high) / 100];
  syncCutoffs();
  clearTimeout(labTimer);
  updateLab();
});
start();
