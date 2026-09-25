"""Export the fitted notebook results for the local dashboard.

build_data.py runs this file as the last notebook cell. It uses the variables
that the notebook has already calculated; no model is fitted here.
"""

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_curve


def as_records(frame):
    return json.loads(frame.to_json(orient='records', date_format='iso'))


def chart_points(outcomes, scores):
    false_positive, true_positive, _ = roc_curve(outcomes, scores)
    # Keep the chart light. Metrics below still use every loan.
    positions = np.unique(
        np.linspace(0, len(false_positive) - 1, min(240, len(false_positive))).astype(int)
    )
    return [
        {'x': float(false_positive[i]), 'y': float(true_positive[i])}
        for i in positions
    ]


output_dir = ROOT / 'dashboard' / 'artifacts'
output_dir.mkdir(parents=True, exist_ok=True)

numeric_profiles = {
    name: {
        'minimum': float(train[name].min()),
        'maximum': float(train[name].max()),
        'p01': float(train[name].quantile(.01)),
        'p99': float(train[name].quantile(.99)),
        'median': float(train[name].median()),
    }
    for name in NUMERIC
}

# The plot is descriptive. It never feeds back into fitting or cutoff selection.
score_check = pd.DataFrame({
    'score': test_scores,
    'outcome': test.charged_off.to_numpy(),
})
score_check['group'] = pd.qcut(score_check.score, 10, duplicates='drop')
score_check = score_check.groupby('group', observed=True).agg(
    mean_score=('score', 'mean'),
    observed_rate=('outcome', 'mean'),
    loans=('outcome', 'size'),
).reset_index(drop=True)

metrics = []
for name, scores in validation_scores.items():
    metrics.append({
        'model': name,
        'split': 'Validation',
        'n': len(validation),
        'roc_auc': float(validation_auc[name]),
        'average_precision': float(average_precision_score(y_validation, scores)),
        'brier': float(brier_score_loss(y_validation, scores)),
        'prevalence': float(y_validation.mean()),
    })

# Only the selected model has a final-test prediction in the notebook.
metrics.append({
    'model': selected_name,
    'split': 'Final test',
    'n': len(test),
    'roc_auc': float(test_auc),
    'average_precision': float(average_precision_score(test.charged_off, test_scores)),
    'brier': float(brier_score_loss(test.charged_off, test_scores)),
    'prevalence': float(test.charged_off.mean()),
})

summary = {
    'sample_size': SAMPLE_SIZE,
    'source_rows': source_rows,
    'seed': SEED,
    'sample_sha256': sample_id_hash,
    'source_md5': EXPECTED_MD5,
    'selected_model': selected_name,
    'cutoffs': list(frozen_cutoffs),
    'splits': as_records(split_summary),
    'metrics': metrics,
    'test_mean_score': float(test_scores.mean()),
    'baseline_brier': float(brier_score_loss(
        test.charged_off, np.full(len(test), y_train.mean())
    )),
    'training_prevalence': float(y_train.mean()),
    'validation_bands': as_records(validation_bands),
    'test_bands': as_records(test_bands),
    'test_routing': as_records(test_routing.reset_index()),
    'test_cohorts': as_records(test_cohorts),
    'by_year': as_records(by_year),
    'by_purpose': as_records(by_purpose),
    'roc': {
        'validation': {
            name: chart_points(y_validation, scores)
            for name, scores in validation_scores.items()
        },
        'test': chart_points(test.charged_off, test_scores),
    },
    'calibration': as_records(score_check),
    'checks_passed': check_count,
    'audit': as_records(audit.reset_index(names='feature')),
    'extremes': extremes,
    'source_duplicate_ids': source_duplicate_ids,
    'employment_missing': employment_ni,
    'numeric_profiles': numeric_profiles,
    'categories': {
        name: sorted(train[name].dropna().unique().tolist())
        for name in CATEGORICAL
    },
    'coefficients': as_records(coefficients),
    'features': FEATURES,
}

(output_dir / 'summary.json').write_text(
    json.dumps(summary, indent=2, allow_nan=False) + '\n', encoding='utf-8'
)
np.savez_compressed(
    output_dir / 'validation.npz',
    scores=validation_scores[selected_name],
    outcomes=y_validation.to_numpy(),
)
joblib.dump(selected_model, output_dir / 'model.joblib')
print('Saved the dashboard data and fitted model from this notebook run.')
